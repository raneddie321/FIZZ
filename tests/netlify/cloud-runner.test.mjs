// The cloud runner: Fizz Code's loop in the sandbox. Runs the real runner against a fake FIZZ (model + web search),
// and checks the run token on the AI and web endpoints.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, writeFile, readFile, cp, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

process.env.FIZZ_SECRET = "test-secret-for-cloud-runner-0123456789abcdef";
const { seal } = await import("../../netlify/lib/util.mjs");
const { handleChat } = await import("../../netlify/lib/ai-chat-core.mjs");

const sse = (text) => text.match(/[\s\S]{1,25}/g).map((c) => `data: ${JSON.stringify({ choices: [{ delta: { content: c } }] })}\n\n`).join("") + `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`;

async function runWith(script, { files = {}, perm = { mode: "auto" }, extra = {} } = {}) {
  const seen = { ai: [], web: [] };
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const c of req) body += c;
    if (req.headers["x-fizz-run"] !== "TOKEN") { res.writeHead(401); return res.end("{}"); }
    if (req.url === "/api/ai/chat") {
      seen.ai.push(JSON.parse(body));
      res.writeHead(200, { "content-type": "text/event-stream" });
      return res.end(sse(script.shift() ?? "All done."));
    }
    if (req.url.startsWith("/api/web/search")) { seen.web.push(req.url); res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify({ provider: "test", results: [{ title: "Docs", url: "https://example.com", snippet: "hello" }] })); }
    res.writeHead(404); res.end("{}");
  }).listen(0);
  const origin = `http://127.0.0.1:${server.address().port}`;
  const root = await mkdtemp(join(tmpdir(), "fizz-run-"));
  const app = join(root, "app"), dir = join(root, "run");
  await mkdir(app, { recursive: true }); await mkdir(dir, { recursive: true });
  for (const [p, v] of Object.entries(files)) { await mkdir(join(app, p, ".."), { recursive: true }); await writeFile(join(app, p), v); }
  await cp(new URL("../../netlify/lib/agent-core.mjs", import.meta.url), join(root, "agent-core.mjs"));
  await cp(new URL("../../netlify/lib/runner/agent-runner.mjs", import.meta.url), join(root, "agent-runner.mjs"));
  await writeFile(join(dir, "input.json"), JSON.stringify({ origin, token: "TOKEN", system: "sys", messages: [{ role: "user", content: "build it" }], mode: "build", step: 1, maxSteps: 8, perm, files, appDir: app, ...extra }));
  const code = await new Promise((ok) => spawn(process.execPath, [join(root, "agent-runner.mjs"), dir], { stdio: "inherit" }).on("close", ok));
  server.close();
  const state = JSON.parse(await readFile(join(dir, "state.json"), "utf8"));
  return { code, state, app, seen };
}

// 1. Writes a file, runs a command, searches, sends the results back, then finishes: "done".
{
  const { code, state, app, seen } = await runWith([
    `I'll make the page.\n<fizz-file path="index.html">\n<h1>Hi</h1>\n</fizz-file>\n<fizz-run>cat index.html > copy.txt && echo ok</fizz-run>\n<fizz-search>vite docs</fizz-search>`,
    `<fizz-edit path="index.html">\n<<<<<<< SEARCH\n<h1>Hi</h1>\n=======\n<h1>Hello</h1>\n>>>>>>> REPLACE\n</fizz-edit>`,
    "Done: the page says Hello.",
  ]);
  assert.equal(code, 0);
  assert.equal(state.status, "done", state.error);
  assert.equal(await readFile(join(app, "index.html"), "utf8"), "<h1>Hello</h1>");
  assert.equal(await readFile(join(app, "copy.txt"), "utf8"), "<h1>Hi</h1>");
  const r1 = state.steps[0].reply;
  assert.deepEqual(r1.tools.map((t) => [t.type, t.status]), [["run", "done"], ["search", "done"]]);
  assert.ok(r1.tools[0].result.text.includes("ok") && r1.tools[0].result.files["copy.txt"] === "<h1>Hi</h1>", "command output and the files it made come back");
  assert.match(state.steps[1].auto.content, /<tool-result tool="run"[\s\S]*<tool-result tool="search"/);
  assert.equal(seen.web.length, 1);
  assert.equal(seen.ai.length, 2, "an edit with nothing to report back ends the run (the page runs its checks)");
  assert.match(seen.ai[1].messages.at(-1).content, /tool-result/);
}
// 2. A tool it can't run here (the browser) hands the task back to the page, with that tool still queued.
{
  const { state } = await runWith([`<fizz-file path="a.txt">\nA\n</fizz-file>\n<fizz-browser action="open" url="https://example.com"/>\n<fizz-run>echo never</fizz-run>`]);
  assert.equal(state.status, "handoff");
  assert.deepEqual(state.steps[0].reply.tools.map((t) => t.status), ["queued", "queued"]);
}
// 3. A command the user's rules don't allow without asking is handed back too (the page asks).
{
  const { state, app } = await runWith([`<fizz-run>touch made.txt</fizz-run>`], { perm: { mode: "auto", rules: { allow: [], ask: ["run:touch *"], deny: [] } } });
  assert.equal(state.status, "handoff");
  await assert.rejects(readFile(join(app, "made.txt")));
}
// 4. A plain answer finishes.
{
  const { state } = await runWith([]);
  assert.equal(state.status, "done");
}

// 5. FIZZ chat: searches the web, then answers; the tags stay in the reply for the page to strip.
{
  const { state, seen } = await runWith(["<search>weather tel aviv</search>", "It's sunny in Tel Aviv."], { extra: { kind: "chat", web: true, replyId: "reply1" } });
  assert.equal(state.status, "done");
  assert.equal(state.steps.length, 1);
  assert.deepEqual([state.steps[0].reply.id, state.steps[0].reply.content, state.steps[0].reply.pending], ["reply1", "It's sunny in Tel Aviv.", false]);
  assert.equal(seen.web.length, 1);
  assert.match(seen.ai[1].messages.at(-1).content, /<search-results query="weather tel aviv">/);
}

// ---------- the run token on the AI endpoint ----------
{
  const calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); return new Response("data: [DONE]\n\n", { status: 200 }); };
  const env = (k) => ({ OPENROUTER_KEY: "server-key" })[k];
  const body = JSON.stringify({ system: "s", messages: [{ role: "user", content: "hi" }] });
  // No origin and no token: refused.
  let r = await handleChat(new Request("https://fizz.test/api/ai/chat", { method: "POST", body }), { env, ip: "1", bump: async () => true });
  assert.equal(r.status, 403);
  // A run with the user's own key: their provider, their key, no FIZZ quota.
  r = await handleChat(new Request("https://fizz.test/api/ai/chat", { method: "POST", body }), { env, ip: "1", bump: async () => { throw new Error("no quota for own keys"); }, run: { kind: "run", u: "user1", ai: { kind: "openai", url: "https://api.example.com/v1/chat/completions", key: "user-key", model: "m1" } } });
  assert.equal(r.status, 200);
  assert.equal(calls.at(-1).url, "https://api.example.com/v1/chat/completions");
  assert.equal(calls.at(-1).init.headers.Authorization, "Bearer user-key");
  assert.equal(JSON.parse(calls.at(-1).init.body).model, "m1");
  // A run on FIZZ AI: the server's key, counted against the user.
  const keys = [];
  r = await handleChat(new Request("https://fizz.test/api/ai/chat", { method: "POST", body }), { env, ip: "1", bump: async (k) => { keys.push(k); return true; }, run: { kind: "run", u: "user1", ai: null } });
  assert.equal(r.status, 200);
  assert.equal(calls.at(-1).init.headers.Authorization, "Bearer server-key");
  assert.ok(keys[0].includes("/run/user1"));
}
// ---------- the run token on the web endpoint ----------
{
  const web = (await import("../../netlify/functions/web.mjs")).default;
  const token = seal({ kind: "run", u: "user1", exp: Date.now() + 60_000 });
  let r = await web(new Request("https://fizz.test/api/web/frame?url=https://example.com", { headers: { "x-fizz-run": token } }), { params: { action: "frame" } });
  assert.equal(r.status, 401, "a run token only searches and reads");
  r = await web(new Request("https://fizz.test/api/web/search?q=x", { headers: { "x-fizz-run": "forged" } }), { params: { action: "search" } });
  assert.equal(r.status, 401);
}
console.log("Cloud runner tests passed");

// ---------- starting, following and stopping a run in the sandbox ----------
{
  const lib = await import("../../netlify/lib/sandbox.mjs");
  const written = {}, cmds = [];
  const sbx = {
    async writeFiles(list) { for (const f of list) written[f.path] = String(f.content); },
    async runCommand(p) { cmds.push(p); return { cmdId: "c", wait: async () => ({ exitCode: 0 }) }; },
    async readFileToBuffer({ path }) { return written[path] !== undefined ? Buffer.from(written[path]) : null; },
    domain: () => "https://sb.example",
  };
  lib.setSandboxModule({ Sandbox: { getOrCreate: async () => sbx } });
  const A = { userId: "u1", projectId: "p1" };
  const token = seal({ kind: "run", u: "u1", ai: { kind: "openai", url: "https://api.example.com/v1/x", key: "USER-SECRET-KEY", model: "m" }, exp: Date.now() + 60_000 });
  await lib.agentStart({ ...A, runId: "abcdef1234", files: { "index.html": "<h1>x</h1>", "../evil": "no" }, input: { system: "s", messages: [] }, token, origin: "https://fizz.test" });
  const dir = "/vercel/sandbox/fizz-run/abcdef1234";
  assert.equal(written["/vercel/sandbox/app/index.html"], "<h1>x</h1>");
  assert.ok(!Object.keys(written).some((p) => p.includes("evil")), "paths outside the project are dropped");
  assert.ok(written["/vercel/sandbox/fizz-run/agent-runner.mjs"].includes("Fizz Code's loop") && written["/vercel/sandbox/fizz-run/agent-core.mjs"].includes("export function parseReply"));
  const input = JSON.parse(written[`${dir}/input.json`]);
  assert.equal(input.origin, "https://fizz.test");
  assert.ok(!JSON.stringify(written).includes("USER-SECRET-KEY"), "the user's key is sealed in the token, never written to the sandbox in the clear");
  assert.ok(cmds.at(-1).detached && cmds.at(-1).args[1].includes("agent-runner.mjs"), "the runner starts detached");
  await assert.rejects(lib.agentStart({ ...A, runId: "../x", files: {}, input: {}, token, origin: "" }), /Bad run id/);
  // Poll: steps from where the page is; a dead runner is reported.
  written[`${dir}/state.json`] = JSON.stringify({ status: "running", updatedAt: Date.now(), steps: [{ reply: { id: "r1" } }, { auto: { id: "a1" } }, { reply: { id: "r2" } }] });
  let r = await lib.agentPoll({ ...A, runId: "abcdef1234", from: 2 });
  assert.deepEqual([r.status, r.total, r.from, r.steps.length], ["running", 3, 2, 1]);
  written[`${dir}/state.json`] = JSON.stringify({ status: "running", updatedAt: Date.now() - 10 * 60_000, steps: [] });
  r = await lib.agentPoll({ ...A, runId: "abcdef1234" });
  assert.equal(r.status, "error");
  r = await lib.agentPoll({ ...A, runId: "ffffffffff" });
  assert.equal(r.status, "lost");
  await lib.agentStop({ ...A, runId: "abcdef1234" });
  assert.equal(written[`${dir}/stop`], "1");
}
console.log("Cloud runner sandbox tests passed");
