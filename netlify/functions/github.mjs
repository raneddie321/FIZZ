import { error, getCookie, json, normalizePath, readJson, sameOrigin, unseal } from "../lib/util.mjs";

const API = "https://api.github.com";
const MAX_IMPORT_FILES = 200;
const MAX_FILE_BYTES = 400_000;

async function gh(token, path, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "FIZZ-DEV", ...(init.body ? { "Content-Type": "application/json" } : {}) },
  });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw Object.assign(new Error(data?.message || `GitHub error ${res.status}`), { status: res.status });
  return data;
}

async function inBatches(items, size, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  return out;
}

const validName = (s) => typeof s === "string" && /^[A-Za-z0-9_.-]{1,100}$/.test(s);
const validBranch = (s) => typeof s === "string" && /^[A-Za-z0-9._/-]{1,200}$/.test(s) && !s.includes("..");

export default async (req, context) => {
  const session = unseal(getCookie(req, "fizz_gh"));
  if (!session) return error(401, "Connect GitHub first.", "not_connected");
  if (!sameOrigin(req)) return error(403, "Not allowed.");
  const t = session.t;
  try {
    switch (context.params.action) {
      case "repos": {
        const repos = await gh(t, "/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member");
        return json({ repos: repos.map((r) => ({ owner: r.owner.login, name: r.name, fullName: r.full_name, private: r.private, defaultBranch: r.default_branch, updatedAt: r.updated_at })) });
      }
      case "create": {
        const body = await readJson(req);
        if (!validName(body.name)) return error(400, "Use letters, numbers, dashes, dots or underscores for the repository name.");
        const r = await gh(t, "/user/repos", { method: "POST", body: JSON.stringify({ name: body.name, private: body.private !== false, auto_init: true, description: String(body.description || "").slice(0, 300) }) });
        return json({ repo: { owner: r.owner.login, name: r.name, fullName: r.full_name, defaultBranch: r.default_branch, url: r.html_url } });
      }
      case "import": {
        const body = await readJson(req);
        if (!validName(body.owner) || !validName(body.repo) || !validBranch(body.branch)) return error(400, "Invalid repository.");
        const base = `/repos/${body.owner}/${body.repo}`;
        const ref = await gh(t, `${base}/git/ref/heads/${encodeURIComponent(body.branch)}`);
        const commit = await gh(t, `${base}/git/commits/${ref.object.sha}`);
        const tree = await gh(t, `${base}/git/trees/${commit.tree.sha}?recursive=1`);
        const blobs = tree.tree.filter((e) => e.type === "blob" && (e.size ?? 0) <= MAX_FILE_BYTES && !/(^|\/)(node_modules|\.git|dist|build|\.next)\//.test(e.path));
        const picked = blobs.slice(0, MAX_IMPORT_FILES);
        const files = {};
        let skippedBinary = 0;
        await inBatches(picked, 12, async (e) => {
          const blob = await gh(t, `${base}/git/blobs/${e.sha}`);
          const buf = Buffer.from(blob.content, "base64");
          if (buf.subarray(0, 8000).includes(0)) { skippedBinary++; return; }
          files[e.path] = buf.toString("utf8");
        });
        return json({ files, headSha: ref.object.sha, total: tree.tree.filter((e) => e.type === "blob").length, imported: Object.keys(files).length, skippedBinary, truncated: blobs.length > MAX_IMPORT_FILES || tree.truncated });
      }
      case "push": {
        const body = await readJson(req);
        if (!validName(body.owner) || !validName(body.repo) || !validBranch(body.branch)) return error(400, "Invalid repository or branch.");
        const entries = Object.entries(body.files || {});
        if (!entries.length) return error(400, "This project has no files to push.");
        if (entries.length > 1000) return error(413, "Too many files to push at once.");
        const base = `/repos/${body.owner}/${body.repo}`;
        let parent = null, baseTree = null;
        try {
          const ref = await gh(t, `${base}/git/ref/heads/${encodeURIComponent(body.branch)}`);
          parent = ref.object.sha;
          baseTree = (await gh(t, `${base}/git/commits/${parent}`)).tree.sha;
        } catch (e) {
          if (e.status !== 404 && e.status !== 409) throw e;
        }
        const tree = await inBatches(entries, 10, async ([path, content]) => {
          const p = normalizePath(path);
          if (!p) throw Object.assign(new Error(`Invalid file path: ${path}`), { status: 400 });
          const blob = await gh(t, `${base}/git/blobs`, { method: "POST", body: JSON.stringify({ content: String(content), encoding: "utf-8" }) });
          return { path: p, mode: "100644", type: "blob", sha: blob.sha };
        });
        // base_tree keeps repository files that aren't part of this project.
        const newTree = await gh(t, `${base}/git/trees`, { method: "POST", body: JSON.stringify({ tree, ...(baseTree ? { base_tree: baseTree } : {}) }) });
        const c = await gh(t, `${base}/git/commits`, { method: "POST", body: JSON.stringify({ message: String(body.message || "Update from FIZZ DEV").slice(0, 500), tree: newTree.sha, parents: parent ? [parent] : [] }) });
        if (parent) await gh(t, `${base}/git/refs/heads/${encodeURIComponent(body.branch)}`, { method: "PATCH", body: JSON.stringify({ sha: c.sha }) });
        else await gh(t, `${base}/git/refs`, { method: "POST", body: JSON.stringify({ ref: `refs/heads/${body.branch}`, sha: c.sha }) });
        return json({ sha: c.sha, url: `https://github.com/${body.owner}/${body.repo}/commit/${c.sha}`, files: tree.length });
      }
      default:
        return error(404, "Unknown action.");
    }
  } catch (e) {
    const status = e.status === 401 ? 401 : e.status && e.status < 500 ? e.status : 502;
    return error(status, status === 401 ? "Your GitHub connection expired. Connect GitHub again." : e.message, status === 401 ? "not_connected" : "github_error");
  }
};

export const config = { path: "/api/github/:action" };
