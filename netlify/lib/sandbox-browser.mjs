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

async function healthy(base, token) {
  try { const r = await fetch(`${base}/health?token=${token}`, { signal: AbortSignal.timeout(4000) }); return r.ok; } catch { return false; }
}

/** Makes sure the user's browser is running. Returns { base, token } or { starting: true } while it installs (first time ~1 minute). */
export async function ensureBrowser(uid, { waitMs = 35000 } = {}) {
  const { Sandbox } = await sdk();
  const sbx = await Sandbox.getOrCreate({ name: nameFor(uid), runtime: "node22", timeout: 45 * 60 * 1000, ports: [PORT], resources: { vcpus: 2 } });
  const base = String(sbx.domain(PORT)).replace(/\/$/, "");
  const token = tokenFor(uid);
  if (await healthy(base, token)) return { base, token };
  await sbx.writeFiles([
    { path: `${DIR}/agent.mjs`, content: Buffer.from(AGENT_JS) },
    { path: `${DIR}/package.json`, content: Buffer.from(AGENT_PKG) },
  ]);
  // One starter at a time (a lock older than 4 minutes is stale).
  const script = [
    `find /tmp/fizz-br-lock -maxdepth 0 -mmin +4 -exec rm -rf {} + 2>/dev/null`,
    `mkdir /tmp/fizz-br-lock 2>/dev/null || exit 0`,
    `cd ${DIR}`,
    `(test -d node_modules/@sparticuz/chromium || npm install --no-audit --no-fund >/tmp/fizz-br-install.log 2>&1)`,
    // Do not use pkill -f here: it can match the shell command that contains this script
    // and terminate startup itself. Keep an already-running agent and start only when absent.
    `if ! pgrep -f '[n]ode agent.mjs' >/dev/null; then FIZZ_BR_TOKEN=${token} FIZZ_BR_PORT=${PORT} AWS_EXECUTION_ENV=AWS_Lambda_nodejs22.x nohup node agent.mjs >/tmp/fizz-br.log 2>&1 & fi`,
    `sleep 1; rm -rf /tmp/fizz-br-lock`,
  ].join("; ");
  await sbx.runCommand({ cmd: "bash", args: ["-lc", script], detached: true });
  const until = Date.now() + waitMs;
  while (Date.now() < until) {
    await new Promise((r) => setTimeout(r, 1500));
    if (await healthy(base, token)) return { base, token };
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
