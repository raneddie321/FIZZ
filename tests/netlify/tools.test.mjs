// Run: node tests/netlify/tools.test.mjs  (fake credentials and fake services only)
// Covers /api/web (search, read, SSRF guard, limits), /api/sync (cloud copies) and the sandbox library.
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
process.env.FIZZ_SECRET = "test-secret-test-secret-test-secret-123";
const O = "https://fizz.example";
const realFetch = globalThis.fetch;

const vWeb = await import("../../api/web/[action].mjs");
const vSync = await import("../../api/sync.mjs");
const sandbox = await import("../../netlify/lib/sandbox.mjs");
const github = (await import("../../netlify/functions/github.mjs")).default;
const { seal } = await import("../../netlify/lib/util.mjs");
const web = (path, init) => vWeb[init?.method || "GET"](new Request(`${O}${path}`, init));
let r, j;

// ---------- web: Wikipedia fallback without any search key ----------
let fetched = [];
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  fetched.push(url);
  if (url.includes("wikipedia.org/w/api.php")) return Response.json({ query: { search: [{ title: "Tel Aviv", snippet: 'A <span class="searchmatch">city</span> &amp; port' }] } });
  if (url.startsWith("https://93.184.216.34/")) return new Response('<html><title>Example</title><body><script>bad()</script><h1>Hello</h1><p>Read <a href="/more">more</a></p></body></html>', { headers: { "content-type": "text/html" } });
  if (url.startsWith("https://93.184.216.35/")) return new Response(null, { status: 302, headers: { location: "http://127.0.0.1/admin" } });
  if (url.startsWith("https://93.184.216.36/")) return new Response("x", { headers: { "x-frame-options": "SAMEORIGIN" } });
  throw new Error(`unexpected fetch ${url}`);
};
r = await web("/api/web/search?action=search&q=tel%20aviv%20city");
j = await r.json();
assert.equal(r.status, 200);
assert.equal(j.provider, "wikipedia");
assert.deepEqual(j.results[0], { title: "Tel Aviv", url: "https://en.wikipedia.org/wiki/Tel_Aviv", snippet: "A city & port" });
r = await web("/api/web/search?action=search&q=%D7%AA%D7%9C%20%D7%90%D7%91%D7%99%D7%91");
assert.match(fetched.at(-1), /^https:\/\/he\.wikipedia\.org/, "Hebrew searches use Hebrew Wikipedia");

// read: page text without scripts, links made absolute
r = await web("/api/web/read?action=read&url=https%3A%2F%2F93.184.216.34%2Fpage");
j = await r.json();
assert.equal(r.status, 200);
assert.equal(j.title, "Example");
assert.match(j.text, /# Hello/);
assert.match(j.text, /\[more\]\(https:\/\/93\.184\.216\.34\/more\)/);
assert.ok(!j.text.includes("bad()"));

// read: never reaches private addresses, other ports or non-web schemes — directly or through a redirect
for (const bad of ["http://127.0.0.1/", "http://localhost/", "http://10.1.2.3/", "http://169.254.169.254/latest/meta-data", "http://[::1]/", "http://[::ffff:192.168.0.1]/", "https://93.184.216.34:8443/", "file:///etc/passwd", "https://93.184.216.35/"]) {
  fetched = [];
  r = await web(`/api/web/read?action=read&url=${encodeURIComponent(bad)}`);
  assert.equal(r.status, 400, bad);
  assert.ok(!fetched.some((u) => /127\.0\.0\.1|localhost|10\.1\.2\.3|169\.254|::1|192\.168/.test(u)), `no request to ${bad}`);
}

// frame check
j = await (await web("/api/web/frame?action=frame&url=https%3A%2F%2F93.184.216.36%2F")).json();
assert.equal(j.frameable, false);

// cross-site POST blocked, unknown action, daily limit
r = await web("/api/web/search?action=search", { method: "POST", headers: { origin: "https://evil.example", "content-type": "application/json" }, body: '{"q":"x"}' });
assert.equal(r.status, 403);
assert.equal((await web("/api/web/nope?action=nope")).status, 404);
process.env.FIZZ_SEARCH_LIMIT = "3"; // two searches already used today
assert.equal((await web("/api/web/search?action=search&q=a")).status, 200);
r = await web("/api/web/search?action=search&q=a");
assert.equal(r.status, 429);
assert.equal((await r.json()).error.code, "quota");
delete process.env.FIZZ_SEARCH_LIMIT;

// Brave is used when its key is set
process.env.BRAVE_SEARCH_API_KEY = "brave_fake";
globalThis.fetch = async (url, init) => {
  assert.match(String(url), /^https:\/\/api\.search\.brave\.com/);
  assert.equal(init.headers["X-Subscription-Token"], "brave_fake");
  return Response.json({ web: { results: [{ title: "T", url: "https://t.example", description: "<b>d</b>" }] } });
};
j = await (await web("/api/web/search?action=search&q=b")).json();
assert.deepEqual(j, { provider: "brave", results: [{ title: "T", url: "https://t.example", snippet: "d" }] });
delete process.env.BRAVE_SEARCH_API_KEY;

// ---------- sync: per-user cloud copies in (fake) Upstash, chunked ----------
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "ins_t", alg: "RS256", use: "sig" };
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (payload) => { const h = b64({ alg: "RS256", kid: "ins_t", typ: "JWT" }), p = b64(payload); return `${h}.${p}.${sign("RSA-SHA256", Buffer.from(`${h}.${p}`), privateKey).toString("base64url")}`; };
const now = Math.floor(Date.now() / 1000);
const alice = jwt({ sub: "user_alice", azp: O, exp: now + 120 });
const bob = jwt({ sub: "user_bob", azp: O, exp: now + 120 });

r = await vSync.GET(new Request(`${O}/api/sync`));
assert.equal(r.status, 503, "sync needs Clerk and Upstash");
process.env.CLERK_SECRET_KEY = "sk_test_fake";
process.env.KV_REST_API_URL = "https://kv.example";
process.env.KV_REST_API_TOKEN = "kv_fake";
const store = new Map();
let biggestRequest = 0;
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  if (url === "https://api.clerk.com/v1/jwks") return Response.json({ keys: [jwk] });
  assert.equal(url, "https://kv.example/pipeline");
  assert.equal(init.headers.Authorization, "Bearer kv_fake");
  biggestRequest = Math.max(biggestRequest, init.body.length);
  return Response.json(JSON.parse(init.body).map(([cmd, k, v]) => {
    if (cmd === "GET") return { result: store.get(k) ?? null };
    if (cmd === "SET") { store.set(k, v); return { result: "OK" }; }
    if (cmd === "DEL") { store.delete(k); return { result: 1 }; }
    if (cmd === "INCR") { const n = Number(store.get(k) || 0) + 1; store.set(k, String(n)); return { result: n }; }
    if (cmd === "EXPIRE") return { result: 1 };
    return { error: `bad ${cmd}` };
  }));
};
const sync = (method, token, { id, body, origin = O } = {}) => vSync[method](new Request(`${O}/api/sync${id ? `?id=${id}` : ""}`, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), origin, "content-type": "application/json" }, body: body && JSON.stringify(body) }));

assert.equal((await sync("GET")).status, 401, "signed-out users can't sync");
const big = { files: { "index.html": "<p>" + "é".repeat(800_000) + "</p>", "a.js": "1" } };
r = await sync("PUT", alice, { body: { id: "p1", kind: "project", name: "Big one", updated: 1000, data: big } });
assert.equal(r.status, 200, await r.clone().text());
assert.ok([...store.keys()].filter((k) => k.startsWith("fizz-sync:user_alice:item:p1:")).length >= 2, "large items are split into chunks");
assert.ok(biggestRequest < 1_000_000, "each storage request stays under 1 MB");
j = await (await sync("GET", alice)).json();
assert.equal(j.items.p1.name, "Big one");
j = await (await sync("GET", alice, { id: "p1" })).json();
assert.deepEqual(j.data, big, "round trip keeps every byte");
assert.equal((await sync("GET", bob, { id: "p1" })).status, 404, "users only see their own items");
j = await (await sync("PUT", alice, { body: { id: "p1", updated: 999, data: { files: {} } } })).json();
assert.equal(j.conflict, true, "older copies don't overwrite newer ones");
await sync("PUT", alice, { body: { id: "p1", updated: 2000, data: { files: { "a.js": "2" } } } });
assert.equal([...store.keys()].filter((k) => k.startsWith("fizz-sync:user_alice:item:p1:")).length, 1, "old chunks are removed");
assert.equal((await sync("PUT", alice, { body: { id: "../x", data: 1 } })).status, 400);
assert.equal((await sync("PUT", alice, { body: { id: "p2", data: 1 }, origin: "https://evil.example" })).status, 403);
await sync("DELETE", alice, { id: "p1" });
assert.deepEqual((await (await sync("GET", alice)).json()).items, {});
assert.ok(![...store.keys()].some((k) => k.startsWith("fizz-sync:user_alice:item:")), "delete removes the data");

// ---------- sandbox library with a fake Vercel Sandbox SDK ----------
const created = [];
class FakeSandbox {
  static async getOrCreate(opts) { created.push(opts); return (FakeSandbox.byName[opts.name] ||= new FakeSandbox(opts)); }
  constructor(opts) { this.opts = opts; this.fs = {}; this.commands = {}; this.stopped = false; }
  async writeFiles(list) { for (const f of list) this.fs[f.path] = Buffer.from(f.content); }
  async runCommand({ cmd, args, detached }) {
    if (cmd === "mkdir") return { exitCode: 0 };
    const script = args[1];
    const id = `cmd_${Object.keys(this.commands).length + 1}`;
    const slow = script.includes("sleep 100");
    const c = {
      cmdId: id,
      wait: () => (slow ? new Promise(() => {}) : Promise.resolve({ exitCode: script.includes("exit 3") ? 3 : 0, output: async () => "built ok\n" })),
      output: async () => "partial output",
    };
    if (!slow) {
      this.fs["/vercel/sandbox/app/dist/out.txt"] = Buffer.from("hello");
      this.fs["/vercel/sandbox/app/dist/app.bin"] = Buffer.from([0, 1, 2, 3]);
      this.fs["/tmp/fizz-changed"] = Buffer.from("./dist/out.txt\n./dist/app.bin\n");
    }
    this.commands[id] = c;
    assert.equal(detached, true);
    return c;
  }
  async getCommand(id) { return this.commands[id]; }
  async readFileToBuffer({ path }) { return this.fs[path] || null; }
  domain(port) { return `https://sb-${port}.example`; }
  async stop() { this.stopped = true; }
}
FakeSandbox.byName = {};
sandbox.setSandboxModule({ Sandbox: FakeSandbox });
j = await sandbox.run({ userId: "user_alice", projectId: "p1", files: { "package.json": "{}", "src/a.js": "x", "node_modules/x/i.js": "skip" }, cmd: "npm run build" });
assert.equal(j.running, false);
assert.equal(j.exitCode, 0);
assert.equal(j.text, "built ok\n");
assert.deepEqual(j.files, { "dist/out.txt": "hello", "dist/app.bin": { base64: "AAECAw==" } }, "changed files come back; binary ones as base64");
const sbx = Object.values(FakeSandbox.byName)[0];
assert.ok(sbx.fs["/vercel/sandbox/app/src/a.js"], "project files are copied in");
assert.ok(!sbx.fs["/vercel/sandbox/app/node_modules/x/i.js"], "node_modules isn't copied");
assert.match(created[0].name, /^fizz-[0-9a-f]{24}$/, "sandbox names don't reveal the user id");
await sandbox.run({ userId: "user_bob", projectId: "p1", cmd: "ls" });
assert.notEqual(created[0].name, created[1].name, "each user gets their own sandbox");
j = await sandbox.run({ userId: "user_alice", projectId: "p1", cmd: "sleep 100", waitMs: 20 });
assert.deepEqual([j.running, j.text], [true, "partial output"], "long commands keep running");
j = await sandbox.run({ userId: "user_alice", projectId: "p1", cmd: "npm run dev", background: true });
assert.equal(j.url, "https://sb-3000.example");
j = await sandbox.wait({ userId: "user_alice", projectId: "p1", cmdId: "cmd_1" });
assert.equal(j.exitCode, 0);
await assert.rejects(sandbox.run({ userId: "u", projectId: "p", files: { "a.txt": "x".repeat(3_200_000) }, cmd: "ls" }), /too large/);
await assert.rejects(
  sandbox.run({ userId: "user_alice", projectId: "p1", files: { "../outside.txt": "nope" }, cmd: "ls" }),
  /Unsafe project file path/,
  "path traversal is rejected before files are written"
);
await assert.rejects(
  sandbox.run({ userId: "user_alice", projectId: "p1", files: { "/tmp/outside.txt": "nope" }, cmd: "ls" }),
  /Unsafe project file path/,
  "absolute paths are rejected"
);
await assert.rejects(
  sandbox.run({ userId: "user_alice", projectId: "p1", files: { "src\\\\..\\\\..\\\\outside.txt": "nope" }, cmd: "ls" }),
  /Unsafe project file path/,
  "Windows-style traversal is rejected too"
);
await assert.rejects(
  sandbox.run({ userId: "user_alice", projectId: "p1", files: {}, cmd: "x".repeat(2001) }),
  /command is too long/,
  "overlong commands are rejected"
);
await assert.rejects(
  sandbox.run({ userId: "user_alice", projectId: "p1", files: Object.fromEntries(Array.from({ length: 501 }, (_, i) => [`f${i}.txt`, "x"])), cmd: "ls" }),
  /Too many project files/,
  "file count is bounded"
);

// ---------- GitHub Actions: runs, artifact link, dispatch ----------
const gh = seal({ t: "tok", label: "@octo" });
const ghReq = (path, init = {}) => new Request(`${O}${path}`, { ...init, headers: { cookie: `fizz_gh=${encodeURIComponent(gh)}`, origin: O, "content-type": "application/json", ...(init.headers || {}) } });
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  if (url.endsWith("/actions/workflows/fizz-android.yml/runs?per_page=10")) return Response.json({ workflow_runs: [{ id: 7, name: "Android", status: "completed", conclusion: "success", html_url: "https://github.com/o/r/actions/runs/7", head_sha: "abc", head_branch: "main" }] });
  if (url.endsWith("/actions/artifacts/9/zip")) { assert.equal(init.redirect, "manual"); return new Response(null, { status: 302, headers: { location: "https://pipelines.example/signed.zip" } }); }
  if (url.endsWith("/actions/workflows/fizz-android.yml/dispatches")) { assert.deepEqual(JSON.parse(init.body).ref, "main"); return new Response(null, { status: 204 }); }
  throw new Error(`unexpected ${url}`);
};
j = await (await github(ghReq("/api/github/runs?owner=o&repo=r&workflow=fizz-android.yml"), { params: { action: "runs" } })).json();
assert.equal(j.runs[0].conclusion, "success");
j = await (await github(ghReq("/api/github/artifact?owner=o&repo=r&id=9"), { params: { action: "artifact" } })).json();
assert.equal(j.url, "https://pipelines.example/signed.zip", "artifact downloads go straight to GitHub's signed link");
r = await github(ghReq("/api/github/dispatch", { method: "POST", body: JSON.stringify({ owner: "o", repo: "r", branch: "main", workflow: "fizz-android.yml" }) }), { params: { action: "dispatch" } });
assert.equal(r.status, 200);
r = await github(ghReq("/api/github/dispatch", { method: "POST", body: JSON.stringify({ owner: "o", repo: "r", branch: "main", workflow: "../../x" }) }), { params: { action: "dispatch" } });
assert.equal(r.status, 400);

globalThis.fetch = realFetch;
console.log("All tool function tests passed");
