// The cloud browser start path (netlify/lib/sandbox-browser.mjs) with a fake Vercel Sandbox.
import assert from "node:assert/strict";
import { setSandboxModule } from "../../netlify/lib/sandbox.mjs";
import { ensureBrowser, tokenFor } from "../../netlify/lib/sandbox-browser.mjs";

function fakeSandbox({ agentCrashes = false } = {}) {
  const state = { listening: false, installed: false, commands: [], files: [] };
  const sbx = {
    domain: () => "https://sb-test.vercel.run",
    async writeFiles(f) { state.files.push(...f.map((x) => x.path)); },
    async runCommand(p) {
      state.commands.push(p);
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
globalThis.fetch = async (url) => {
  const u = new URL(url);
  if (!st.listening) throw new Error("connect refused");
  return new Response("{}", { status: u.searchParams.get("token") === tokenFor("u1") ? 200 : 401 });
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

// 3. The agent crashes: the error says why instead of "starting" forever.
st = fakeSandbox({ agentCrashes: true });
await assert.rejects(ensureBrowser("u1", { waitMs: 20000 }), /agent stopped: .*chromium exploded/);

globalThis.fetch = realFetch;
console.log("Cloud browser start tests passed");
