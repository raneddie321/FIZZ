// The cloud browser start path (netlify/lib/sandbox-browser.mjs) with a fake Vercel Sandbox.
import assert from "node:assert/strict";
import { setSandboxModule } from "../../netlify/lib/sandbox.mjs";
import { AGENT_VERSION, ensureBrowser, tokenFor } from "../../netlify/lib/sandbox-browser.mjs";

function fakeSandbox({ agentCrashes = false } = {}) {
  const state = { listening: false, installed: false, commands: [], files: [] };
  const sbx = {
    domain: () => "https://sb-test.vercel.run",
    async writeFiles(f) { state.files.push(...f.map((x) => x.path)); },
    async runCommand(p) {
      state.commands.push(p);
      if (p.cmd === "bash" && /pkill/.test(p.args[1])) { state.listening = false; state.version = undefined; return { exitCode: 0 }; }
      if (p.cmd === "node" && p.args[0] === "-e") return { exitCode: state.listening ? 0 : 1 };
      if (p.cmd === "bash" && /npm install/.test(p.args[1])) { state.installed = true; return { exitCode: 0 }; }
      if (p.cmd === "bash" && /exec node agent\.mjs/.test(p.args[1])) { if (!agentCrashes) state.listening = true; return { cmdId: "c1" }; }
      if (p.cmd === "bash" && /tail/.test(p.args[1])) return { exitCode: 0, stdout: async () => "Error: chromium exploded" };
      return { exitCode: 0 };
    },
  };
  setSandboxModule({ Sandbox: { getOrCreate: async () => sbx } });
  return state;
}

const realFetch = globalThis.fetch;
let st;
const calls = [];
globalThis.fetch = async (url) => {
  const u = new URL(url);
  if (!st.listening) throw new Error("connect refused");
  calls.push(u.origin);
  return new Response(JSON.stringify({ ok: true, version: st.version ?? AGENT_VERSION }), { status: u.searchParams.get("token") === tokenFor("u1") ? 200 : 401 });
};

// 1. A fresh sandbox: installs, starts the agent as its own detached command, and answers.
st = fakeSandbox();
let r = await ensureBrowser("u1", { waitMs: 8000 });
assert.equal(r.base, "https://sb-test.vercel.run");
assert.equal(r.token, tokenFor("u1"));
const start = st.commands.find((c) => /exec node agent\.mjs/.test(c.args?.[1] || ""));
assert.ok(start?.detached, "the agent runs as its own detached command");
assert.equal(start.env.FIZZ_BR_TOKEN, tokenFor("u1"));
assert.ok(!st.commands.some((c) => /pgrep/.test(JSON.stringify(c))), "no pgrep: it matched its own shell and never started the agent");
assert.ok(st.files.some((f) => f.endsWith("/agent.mjs")));

// 2. Already running: no install, no second start.
const n = st.commands.length;
r = await ensureBrowser("u1", { waitMs: 3000 });
assert.ok(r.base && st.commands.length === n, "a running browser is reused as is");

// 2b. Fast path: a known address that answers needs no Sandbox API call.
let sdkCalls = 0;
setSandboxModule({ Sandbox: { getOrCreate: async () => { sdkCalls++; throw new Error("should not be called"); } } });
r = await ensureBrowser("u1", { waitMs: 3000, base: "https://sb-test.vercel.run" });
assert.equal(r.base, "https://sb-test.vercel.run");
assert.equal(sdkCalls, 0, "no Sandbox API call when the browser already answers");

// 2c. An older agent is still running: it's stopped (with its Chromium) and the current one started.
st = fakeSandbox();
st.listening = true; st.version = "old";
r = await ensureBrowser("u1", { waitMs: 8000 });
assert.ok(r.base, "the current agent answers");
assert.ok(st.commands.some((c) => /pkill -f 'node agent\.mjs'.*remote-debugging-port/.test(c.args?.[1] || "")), "the old agent and its Chromium are stopped");
assert.equal(st.commands.find((c) => /exec node agent/.test(c.args?.[1] || ""))?.env.FIZZ_BR_VERSION, AGENT_VERSION, "the new agent knows its version");

// 3. The agent crashes: the error says why instead of "starting" forever.
st = fakeSandbox({ agentCrashes: true });
await assert.rejects(ensureBrowser("u1", { waitMs: 20000 }), /agent stopped: .*chromium exploded/);

globalThis.fetch = realFetch;
console.log("Cloud browser start tests passed");
