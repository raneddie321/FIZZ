// The Git workflow actions of /api/github (branch from a base, deletions, pull requests, checks, replies, merge)
// against a fake GitHub API.
import assert from "node:assert/strict";
process.env.FIZZ_SECRET = "test-secret-test-secret-test-secret-123";
const { seal } = await import("../../netlify/lib/util.mjs");
const github = (await import("../../netlify/functions/github.mjs")).default;
const O = "https://fizz.example";
const cookie = `fizz_gh=${encodeURIComponent(seal({ t: "tok", label: "@octo", scopes: ["repo", "workflow"] }))}`;
const call = (action, body, query = "") => github(new Request(`${O}/api/github/${action}${query}`, body ? { method: "POST", headers: { origin: O, cookie, "content-type": "application/json" }, body: JSON.stringify(body) } : { headers: { cookie } }), { params: { action } });

const seen = [];
const refs = { main: "sha-main" };
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(url);
  const method = init.method || "GET";
  const body = init.body ? JSON.parse(init.body) : null;
  seen.push({ method, path: u.pathname + u.search, body });
  const ok = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
  const P = u.pathname.replace("/repos/me/app", "");
  if (method === "GET" && P.startsWith("/git/ref/heads/")) { const b = decodeURIComponent(P.slice("/git/ref/heads/".length)); return refs[b] ? ok({ object: { sha: refs[b] } }) : ok({ message: "Not Found" }, 404); }
  if (method === "GET" && P.startsWith("/git/commits/")) return ok({ tree: { sha: `tree-of-${P.split("/").pop()}` } });
  if (method === "POST" && P === "/git/blobs") return ok({ sha: `blob-${seen.length}` });
  if (method === "POST" && P === "/git/trees") return ok({ sha: "new-tree" });
  if (method === "POST" && P === "/git/commits") return ok({ sha: "new-commit" });
  if (method === "POST" && P === "/git/refs") { refs[body.ref.replace("refs/heads/", "")] = body.sha; return ok({}); }
  if (method === "PATCH" && P.startsWith("/git/refs/heads/")) return ok({});
  if (method === "POST" && P === "/pulls") return ok({ number: 7, title: body.title, state: "open", head: { ref: body.head, sha: "new-commit" }, base: { ref: body.base }, html_url: "https://github.com/me/app/pull/7", user: { login: "octo" } }, 201);
  if (method === "GET" && P === "/pulls") return ok([{ number: 7, title: "Fix", state: "open", head: { ref: "fizz/fix" }, base: { ref: "main" }, html_url: "u" }]);
  if (method === "GET" && P === "/pulls/7") return ok({ number: 7, title: "Fix", state: "open", mergeable: true, mergeable_state: "clean", head: { ref: "fizz/fix", sha: "new-commit" }, base: { ref: "main" }, html_url: "u" });
  if (P === "/commits/new-commit/check-runs") return ok({ check_runs: [{ id: 1, name: "test", status: "completed", conclusion: "failure", html_url: "https://github.com/me/app/actions/runs/9/job/55", output: { title: "1 test failed" } }, { id: 2, name: "lint", status: "completed", conclusion: "success", html_url: "x" }] });
  if (P === "/actions/jobs/55/logs") return new Response("2026-01-01T00:00:00.000Z npm test\n2026-01-01T00:00:01.000Z FAIL login.test.js: expected 302", { status: 200 });
  if (P === "/pulls/7/reviews") return ok([{ id: 3, user: { login: "rev" }, state: "CHANGES_REQUESTED", body: "Please add a test" }]);
  if (P === "/pulls/7/comments" && method === "GET") return ok([{ id: 44, user: { login: "rev" }, path: "src/a.js", line: 3, body: "Typo here" }]);
  if (P === "/issues/7/comments" && method === "GET") return ok([]);
  if (P === "/pulls/7/comments/44/replies") return ok({ id: 45, html_url: "reply-url" }, 201);
  if (P === "/issues/7/comments" && method === "POST") return ok({ id: 46, html_url: "comment-url" }, 201);
  if (P === "/actions/runs/9/rerun-failed-jobs") return new Response(null, { status: 201 });
  if (P === "/pulls/7/merge") return ok({ merged: true, sha: "merged-sha", message: "ok" });
  return ok({ message: `unexpected ${method} ${u.pathname}` }, 500);
};

// A commit to a branch that doesn't exist yet starts from the base branch (history and files kept), and deletes files.
let r = await call("push", { owner: "me", repo: "app", branch: "fizz/fix", from: "main", message: "Fix login", files: { "src/a.js": "x" }, deleted: ["old.js"] });
let j = await r.json();
assert.equal(r.status, 200, JSON.stringify(j));
const commit = seen.find((x) => x.method === "POST" && x.path.endsWith("/git/commits"));
assert.deepEqual(commit.body.parents, ["sha-main"], "the new branch's first commit has main as its parent");
const tree = seen.find((x) => x.method === "POST" && x.path.endsWith("/git/trees"));
assert.equal(tree.body.base_tree, "tree-of-sha-main", "main's files are kept");
assert.ok(tree.body.tree.some((e) => e.path === "old.js" && e.sha === null), "deleted files are removed in the commit");
assert.equal(refs["fizz/fix"], "new-commit", "the branch is created, not patched");
assert.ok(!seen.some((x) => x.method === "PATCH"), "nothing else was moved");
// Pull requests
r = await call("pr-create", { owner: "me", repo: "app", head: "fizz/fix", base: "main", title: "Fix login", body: "Why and how" });
j = await r.json();
assert.equal(j.pr.number, 7);
assert.equal((await call("pr-create", { owner: "me", repo: "app", head: "main", base: "main" })).status, 400, "head and base must differ");
j = await (await call("prs", null, "?owner=me&repo=app&head=fizz/fix")).json();
assert.ok(seen.at(-1).path.includes("head=me%3Afizz%2Ffix") && j.prs[0].number === 7);
// Status: failing checks come with the end of their log; reviews and comments
j = await (await call("pr", null, "?owner=me&repo=app&number=7")).json();
const failed = j.checks.find((c) => c.name === "test");
assert.ok(failed.log.includes("FAIL login.test.js") && !failed.log.includes("2026-01-01T"), "the failing job's log, without timestamps");
assert.ok(!j.checks.find((c) => c.name === "lint").log, "passing checks don't fetch logs");
assert.equal(j.reviews[0].state, "CHANGES_REQUESTED");
assert.equal(j.comments[0].id, 44);
// Replies, rerun, merge
assert.equal((await (await call("pr-reply", { owner: "me", repo: "app", number: 7, commentId: 44, body: "Fixed" })).json()).url, "reply-url");
assert.equal((await (await call("pr-reply", { owner: "me", repo: "app", number: 7, body: "Ready" })).json()).url, "comment-url");
assert.equal((await call("pr-reply", { owner: "me", repo: "app", number: 7, body: "  " })).status, 400);
assert.equal((await (await call("rerun", { owner: "me", repo: "app", runId: 9 })).json()).ok, true);
j = await (await call("merge", { owner: "me", repo: "app", number: 7 })).json();
assert.ok(j.merged && seen.at(-1).body.merge_method === "squash");
// Input checks
assert.equal((await call("pr", null, "?owner=me&repo=app&number=x")).status, 400);
assert.equal((await call("push", { owner: "me", repo: "app", branch: "../x", files: { a: "1" } })).status, 400);
assert.equal((await github(new Request(`${O}/api/github/merge`, { method: "POST", headers: { origin: "https://evil.example", cookie }, body: "{}" }), { params: { action: "merge" } })).status, 403, "cross-site is refused");
console.log("GitHub Git workflow tests passed");
