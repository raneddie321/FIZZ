import "server-only";
import { db } from "../db";
import { decrypt } from "../crypto";
import { badRequest } from "../http";

const API = "https://api.github.com";

async function gh<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "FIZZ-DEV",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
    signal: init.signal ?? AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const text = await res.text();
    let message = text;
    try {
      message = (JSON.parse(text) as { message?: string }).message ?? text;
    } catch {}
    throw new GitHubError(res.status, message.slice(0, 300));
  }
  return (res.status === 204 ? null : await res.json()) as T;
}

export class GitHubError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(`GitHub API ${status}: ${message}`);
  }
}

export async function githubWhoAmI(token: string) {
  const res = await fetch(`${API}/user`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "FIZZ-DEV" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new GitHubError(res.status, "unauthorized");
  const user = (await res.json()) as { login: string };
  const scopes = (res.headers.get("x-oauth-scopes") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return { login: user.login, scopes };
}

export async function githubTokenFor(userId: string): Promise<string> {
  const svc = await db.connectedService.findUnique({ where: { userId_service: { userId, service: "github" } } });
  if (!svc?.encryptedToken) throw badRequest("Connect your GitHub account in Settings → Connected services first.");
  return decrypt(svc.encryptedToken);
}

type TreeEntry = { path: string; type: "blob" | "tree" | "commit"; sha: string; size?: number };

const MAX_IMPORT_FILES = 800;
const MAX_FILE_BYTES = 512 * 1024;

/** Reads a repository branch into memory (text files only, size-limited). */
export async function importRepository(token: string, owner: string, repo: string, branch: string) {
  const ref = await gh<{ object: { sha: string } }>(token, `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
  const commit = await gh<{ tree: { sha: string } }>(token, `/repos/${owner}/${repo}/git/commits/${ref.object.sha}`);
  const tree = await gh<{ tree: TreeEntry[]; truncated: boolean }>(token, `/repos/${owner}/${repo}/git/trees/${commit.tree.sha}?recursive=1`);
  const blobs = tree.tree.filter((e) => e.type === "blob" && (e.size ?? 0) <= MAX_FILE_BYTES && !e.path.startsWith("node_modules/"));
  const files: { path: string; content: string; encoding: "utf8" | "base64" }[] = [];
  for (const entry of blobs.slice(0, MAX_IMPORT_FILES)) {
    const blob = await gh<{ content: string; encoding: string }>(token, `/repos/${owner}/${repo}/git/blobs/${entry.sha}`);
    const buf = Buffer.from(blob.content, blob.encoding === "base64" ? "base64" : "utf8");
    const isText = !buf.subarray(0, 8000).includes(0);
    files.push({ path: entry.path, content: isText ? buf.toString("utf8") : buf.toString("base64"), encoding: isText ? "utf8" : "base64" });
  }
  return { headSha: ref.object.sha, files, skipped: tree.tree.filter((e) => e.type === "blob").length - files.length, truncated: tree.truncated };
}

/** Creates a single commit on `branch` containing the given full file set (Git Data API). */
export async function pushSnapshot(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  files: { path: string; content: string; encoding: string }[],
  message: string,
) {
  let parentSha: string | null = null;
  try {
    const ref = await gh<{ object: { sha: string } }>(token, `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
    parentSha = ref.object.sha;
  } catch (e) {
    if (!(e instanceof GitHubError && e.status === 404)) throw e;
  }
  const treeItems = [];
  for (const f of files) {
    const blob = await gh<{ sha: string }>(token, `/repos/${owner}/${repo}/git/blobs`, {
      method: "POST",
      body: JSON.stringify({ content: f.content, encoding: f.encoding === "base64" ? "base64" : "utf-8" }),
    });
    treeItems.push({ path: f.path, mode: "100644", type: "blob", sha: blob.sha });
  }
  const tree = await gh<{ sha: string }>(token, `/repos/${owner}/${repo}/git/trees`, { method: "POST", body: JSON.stringify({ tree: treeItems }) });
  const commit = await gh<{ sha: string; html_url: string }>(token, `/repos/${owner}/${repo}/git/commits`, {
    method: "POST",
    body: JSON.stringify({ message, tree: tree.sha, parents: parentSha ? [parentSha] : [] }),
  });
  if (parentSha) {
    await gh(token, `/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, { method: "PATCH", body: JSON.stringify({ sha: commit.sha, force: false }) });
  } else {
    await gh(token, `/repos/${owner}/${repo}/git/refs`, { method: "POST", body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: commit.sha }) });
  }
  return commit;
}
