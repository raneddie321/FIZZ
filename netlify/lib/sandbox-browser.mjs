// FIZZ's own cloud browser: Chromium in the user's Vercel Sandbox (no Browserbase account needed).
// The agent (browser-agent.js) runs next to Chromium and only answers requests with the user's token,
// which is derived from FIZZ_SECRET and the user id, so nothing has to be stored.
import { createHash, createHmac } from "node:crypto";
import { AGENT_JS, AGENT_PKG } from "./browser-agent-src.mjs";
import { sandboxEnabled, sdk } from "./sandbox.mjs";
import { env } from "./util.mjs";
import { redactUrl } from "./browser.mjs";

const DIR = "/vercel/sandbox/fizz-browser";
const PORT = 8080;
/** On when FIZZ_SANDBOX=on on Vercel (FIZZ_BROWSER=off turns just the browser off). */
export const sandboxBrowserEnabled = () => sandboxEnabled() && Boolean(env("VERCEL") || env("FIZZ_SANDBOX_LOCAL")) && env("FIZZ_BROWSER") !== "off";
export const tokenFor = (uid) => createHmac("sha256", env("FIZZ_SECRET") || "fizz").update(`browser:${uid}`).digest("hex").slice(0, 40);
const nameFor = (uid) => `fizz-br-${createHash("sha256").update(`browser:${uid}`).digest("hex").slice(0, 24)}`;

/** 200 when the browser is ready, 401 when an agent with another token answers, 0 when nothing answers. */
async function health(base, token) {
  try { const r = await fetch(`${base}/health?token=${token}`, { signal: AbortSignal.timeout(6000) }); return r.status; } catch { return 0; }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Is the agent listening inside the sandbox? (Any answer counts — without the token it's a quick 401.)
// This asks from inside the VM, so it works even before the public route answers.
const PROBE = `fetch("http://127.0.0.1:${PORT}/ping",{signal:AbortSignal.timeout(2500)}).then(()=>process.exit(0),()=>process.exit(1))`;
async function listening(sbx) {
  try { return (await sbx.runCommand({ cmd: "node", args: ["-e", PROBE] })).exitCode === 0; } catch { return false; }
}
async function logTail(sbx) {
  try { const r = await sbx.runCommand({ cmd: "bash", args: ["-c", "tail -c 1500 /tmp/fizz-br.log 2>/dev/null; tail -c 800 /tmp/fizz-br-install.log 2>/dev/null"] }); return (await r.stdout()).trim(); } catch { return ""; }
}
function publicBase(sbx) {
  try { return String(sbx.domain(PORT)).replace(/\/$/, ""); } catch { return ""; }
}

/** Makes sure the user's browser is running. Returns { base, token } or { starting: true } while it installs (first time ~1 minute). */
export async function ensureBrowser(uid, { waitMs = 35000 } = {}) {
  const { Sandbox } = await sdk();
  const sbx = await Sandbox.getOrCreate({ name: nameFor(uid), runtime: "node22", timeout: 45 * 60 * 1000, ports: [PORT], resources: { vcpus: 2 } });
  const token = tokenFor(uid);
  let base = publicBase(sbx);
  // A sandbox made before the port was exposed: expose it now.
  if (!base && typeof sbx.update === "function") { await sbx.update({ ports: [PORT] }).catch(() => {}); base = publicBase(sbx); }
  if (!base) throw new Error("the sandbox has no public address for the browser");
  let st = await health(base, token);
  if (st === 200) return { base, token };
  // An old agent started with a different token: stop it and start a fresh one.
  if (st === 401) { await sbx.runCommand({ cmd: "pkill", args: ["-f", "node agent.mjs"] }).catch(() => {}); await sleep(500); }

  if (!(await listening(sbx))) {
    await sbx.writeFiles([
      { path: `${DIR}/agent.mjs`, content: Buffer.from(AGENT_JS) },
      { path: `${DIR}/package.json`, content: Buffer.from(AGENT_PKG) },
    ]);
    // Install Chromium once (a lock keeps two requests from installing at the same time).
    const install = `cd ${DIR} && (test -d node_modules/@sparticuz/chromium || { if command -v flock >/dev/null; then flock /tmp/fizz-br-install.lock sh -c 'test -d node_modules/@sparticuz/chromium || npm install --no-audit --no-fund'; else npm install --no-audit --no-fund; fi; } >/tmp/fizz-br-install.log 2>&1)`;
    const done = await sbx.runCommand({ cmd: "bash", args: ["-c", install] });
    if (done.exitCode !== 0) throw new Error(`installing the browser failed: ${(await logTail(sbx)).slice(-500) || `exit ${done.exitCode}`}`);
    // The agent is its own long-running command (not a child of a shell that exits), so it stays up.
    // Another request may have started it a moment ago: a second copy just fails to bind and exits.
    if (!(await listening(sbx))) {
      await sbx.runCommand({
        cmd: "bash", args: ["-c", "exec node agent.mjs >>/tmp/fizz-br.log 2>&1"], cwd: DIR, detached: true,
        env: { FIZZ_BR_TOKEN: token, FIZZ_BR_PORT: String(PORT), AWS_EXECUTION_ENV: "AWS_Lambda_nodejs22.x" },
      });
    }
  }
  const until = Date.now() + waitMs;
  let checks = 0;
  while (Date.now() < until) {
    await sleep(1500);
    st = await health(base, token);
    if (st === 200) return { base, token };
    // If the agent isn't even listening after a few seconds, it crashed: say why instead of "starting" forever.
    if (++checks === 4 && !(await listening(sbx))) {
      await sleep(1500);
      if (!(await listening(sbx))) throw new Error(`the browser agent stopped: ${(await logTail(sbx)).slice(-600) || "no log"}`);
    }
  }
  return { starting: true };
}

/** The tabs and live view links for the client. */
export async function sandboxTabs(base, token) {
  const r = await fetch(`${base}/tabs?token=${token}`, { signal: AbortSignal.timeout(6000) });
  if (!r.ok) throw new Error("The cloud browser isn't answering.");
  return (await r.json()).tabs.map((t) => ({ ...t, url: redactUrl(t.url), stream: `${base}/stream?token=${token}&target=${t.id}`, input: `${base}/input?token=${token}&target=${t.id}` }));
}
export const cdpUrl = (base, token) => `${base.replace(/^http/, "ws")}/cdp?token=${token}`;
