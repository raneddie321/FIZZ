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
          // Binary files (images, PDFs, documents) arrive as { base64 }.
          const payload = content && typeof content === "object" && typeof content.base64 === "string" ? { content: content.base64, encoding: "base64" } : { content: String(content), encoding: "utf-8" };
          const blob = await gh(t, `${base}/git/blobs`, { method: "POST", body: JSON.stringify(payload) });
          return { path: p, mode: "100644", type: "blob", sha: blob.sha };
        });
        // base_tree keeps repository files that aren't part of this project.
        const newTree = await gh(t, `${base}/git/trees`, { method: "POST", body: JSON.stringify({ tree, ...(baseTree ? { base_tree: baseTree } : {}) }) });
        const c = await gh(t, `${base}/git/commits`, { method: "POST", body: JSON.stringify({ message: String(body.message || "Update from FIZZ DEV").slice(0, 500), tree: newTree.sha, parents: parent ? [parent] : [] }) });
        if (parent) await gh(t, `${base}/git/refs/heads/${encodeURIComponent(body.branch)}`, { method: "PATCH", body: JSON.stringify({ sha: c.sha }) });
        else await gh(t, `${base}/git/refs`, { method: "POST", body: JSON.stringify({ ref: `refs/heads/${body.branch}`, sha: c.sha }) });
        return json({ sha: c.sha, url: `https://github.com/${body.owner}/${body.repo}/commit/${c.sha}`, files: tree.length });
      }
      // GitHub Actions — used by FIZZ DEV to build Android (APK/AAB) and desktop apps in the user's repo.
      case "runs": {
        const q = new URL(req.url).searchParams;
        if (!validName(q.get("owner")) || !validName(q.get("repo"))) return error(400, "Invalid repository.");
        const wf = q.get("workflow");
        if (wf && !/^[A-Za-z0-9_.-]{1,100}\.ya?ml$/.test(wf)) return error(400, "Invalid workflow.");
        const base = `/repos/${q.get("owner")}/${q.get("repo")}/actions`;
        const d = await gh(t, wf ? `${base}/workflows/${wf}/runs?per_page=10` : `${base}/runs?per_page=10`).catch((e) => { if (e.status === 404) return { workflow_runs: [] }; throw e; });
        return json({ runs: (d.workflow_runs || []).map((r) => ({ id: r.id, name: r.name, status: r.status, conclusion: r.conclusion, url: r.html_url, sha: r.head_sha, branch: r.head_branch, createdAt: r.created_at, updatedAt: r.updated_at })) });
      }
      case "jobs": {
        const q = new URL(req.url).searchParams;
        if (!validName(q.get("owner")) || !validName(q.get("repo")) || !/^\d{1,20}$/.test(q.get("runId") || "")) return error(400, "Invalid run.");
        const d = await gh(t, `/repos/${q.get("owner")}/${q.get("repo")}/actions/runs/${q.get("runId")}/jobs`);
        return json({ jobs: (d.jobs || []).map((j) => ({ id: j.id, name: j.name, status: j.status, conclusion: j.conclusion, url: j.html_url, steps: (j.steps || []).map((s) => ({ name: s.name, status: s.status, conclusion: s.conclusion })) })) });
      }
      case "artifacts": {
        const q = new URL(req.url).searchParams;
        if (!validName(q.get("owner")) || !validName(q.get("repo")) || !/^\d{1,20}$/.test(q.get("runId") || "")) return error(400, "Invalid run.");
        const d = await gh(t, `/repos/${q.get("owner")}/${q.get("repo")}/actions/runs/${q.get("runId")}/artifacts`);
        return json({ artifacts: (d.artifacts || []).map((a) => ({ id: a.id, name: a.name, size: a.size_in_bytes, expired: a.expired, expiresAt: a.expires_at })) });
      }
      case "log": {
        // The end of a job's log, so Fizz Code can see why a build failed.
        const q = new URL(req.url).searchParams;
        if (!validName(q.get("owner")) || !validName(q.get("repo")) || !/^\d{1,20}$/.test(q.get("jobId") || "")) return error(400, "Invalid job.");
        const res = await fetch(`${API}/repos/${q.get("owner")}/${q.get("repo")}/actions/jobs/${q.get("jobId")}/logs`, { headers: { Authorization: `Bearer ${t}`, Accept: "application/vnd.github+json", "User-Agent": "FIZZ-DEV" } });
        if (!res.ok) throw Object.assign(new Error(`GitHub error ${res.status}`), { status: res.status });
        const text = (await res.text()).replace(/^\d{4}-\d\d-\d\dT[\d:.]+Z /gm, "");
        return json({ text: text.slice(-12000), truncated: text.length > 12000 });
      }
      case "artifact": {
        // GitHub answers with a short-lived signed link; hand it to the browser instead of proxying the bytes.
        const q = new URL(req.url).searchParams;
        if (!validName(q.get("owner")) || !validName(q.get("repo")) || !/^\d{1,20}$/.test(q.get("id") || "")) return error(400, "Invalid artifact.");
        const res = await fetch(`${API}/repos/${q.get("owner")}/${q.get("repo")}/actions/artifacts/${q.get("id")}/zip`, { redirect: "manual", headers: { Authorization: `Bearer ${t}`, Accept: "application/vnd.github+json", "User-Agent": "FIZZ-DEV" } });
        const location = res.headers.get("location");
        if (res.status >= 300 && res.status < 400 && location) return json({ url: location });
        const data = await res.json().catch(() => null);
        throw Object.assign(new Error(data?.message || `GitHub error ${res.status}`), { status: res.status });
      }
      case "dispatch": {
        const body = await readJson(req);
        if (!validName(body.owner) || !validName(body.repo) || !validBranch(body.branch)) return error(400, "Invalid repository or branch.");
        if (!/^[A-Za-z0-9_.-]{1,100}\.ya?ml$/.test(body.workflow || "")) return error(400, "Invalid workflow.");
        try {
          await gh(t, `/repos/${body.owner}/${body.repo}/actions/workflows/${body.workflow}/dispatches`, { method: "POST", body: JSON.stringify({ ref: body.branch, inputs: body.inputs && typeof body.inputs === "object" ? body.inputs : undefined }) });
        } catch (e) {
          if (e.status === 404) return error(404, "GitHub can't find that workflow yet. Push the project first, then try again.", "no_workflow");
          if (e.status === 403) return error(403, "Your GitHub connection can't start workflows. Connect GitHub again to allow it.", "needs_workflow_scope");
          throw e;
        }
        return json({ ok: true });
      }
      default:
        return error(404, "Unknown action.");
    }
  } catch (e) {
    if (/without `?workflow`? scope/i.test(e.message || "")) return error(403, "To push app build workflows, connect GitHub again — FIZZ needs permission to update workflows.", "needs_workflow_scope");
    const status = e.status === 401 ? 401 : e.status && e.status < 500 ? e.status : 502;
    return error(status, status === 401 ? "Your GitHub connection expired. Connect GitHub again." : e.message, status === 401 ? "not_connected" : "github_error");
  }
};

export const config = { path: "/api/github/:action" };
