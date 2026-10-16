// Fizz Code's own Linux sandbox (Vercel Sandbox: a Firecracker microVM with Node 22, npm, git, Python).
// One named sandbox per user and project; the project's text files are copied in before each command and
// files the command creates or changes come back. Turned on with FIZZ_SANDBOX=on on a Vercel deployment.
import { createHash } from "node:crypto";
import { env } from "./util.mjs";

let mod = null;
/** Tests replace the SDK with a fake. */
export function setSandboxModule(m) { mod = m; }
export async function sdk() {
  if (mod) return mod;
  const name = "@vercel/sandbox";
  mod = await import(name);
  return mod;
}
export const sandboxEnabled = () => env("FIZZ_SANDBOX") === "on";
const APP = "/vercel/sandbox/app";
const PORT = 3000;

function sandboxName(userId, projectId) {
  return `fizz-${createHash("sha256").update(`${userId}:${projectId}`).digest("hex").slice(0, 24)}`;
}

async function open(userId, projectId) {
  const { Sandbox } = await sdk();
  const name = sandboxName(userId, projectId);
  return Sandbox.getOrCreate({ name, runtime: "node22", timeout: 30 * 60 * 1000, ports: [PORT], resources: { vcpus: 2 } });
}

const TEXT_LIMIT = 3 * 1048576;
/**
 * Runs one shell command. Waits up to `waitMs` (default 45 s, inside the function's time limit);
 * long commands keep running and are picked up with wait().
 */
export async function run({ userId, projectId, files = {}, cmd, waitMs = 45000, background = false }) {
  const sbx = await open(userId, projectId);
  const list = Object.entries(files).filter(([p, v]) => typeof v === "string" && !p.startsWith("node_modules/"));
  const total = list.reduce((n, [, v]) => n + v.length, 0);
  if (total > TEXT_LIMIT) throw Object.assign(new Error("The project is too large to copy into the sandbox (over 3 MB of text)."), { status: 413 });
  await sbx.runCommand({ cmd: "mkdir", args: ["-p", APP] });
  if (list.length) await sbx.writeFiles(list.map(([path, content]) => ({ path: `${APP}/${path}`, content: Buffer.from(content) })));
  const script = `cd ${APP} && touch /tmp/fizz-start && (${cmd}) 2>&1; code=$?; find . -newer /tmp/fizz-start -type f -not -path './node_modules/*' -not -path './.git/*' -not -path '*/__pycache__/*' -size -400k 2>/dev/null | head -100 > /tmp/fizz-changed; exit $code`;
  const command = await sbx.runCommand({ cmd: "bash", args: ["-lc", script], detached: true });
  if (background) return { running: true, cmdId: command.cmdId, url: sbx.domain(PORT), text: `Started in the background. If it serves on port ${PORT}, it's at ${sbx.domain(PORT)}` };
  return collect(sbx, command, waitMs);
}

async function collect(sbx, command, waitMs) {
  const done = await Promise.race([command.wait(), new Promise((r) => setTimeout(() => r(null), waitMs))]);
  if (!done) return { running: true, cmdId: command.cmdId, text: (await safeOutput(command)).slice(-6000) };
  const text = (await done.output("both")).slice(-20000);
  const changed = await changedFiles(sbx);
  return { running: false, exitCode: done.exitCode, text, files: changed, url: sbx.domain(PORT) };
}
const safeOutput = async (c) => { try { return await c.output("both"); } catch { return ""; } };

async function changedFiles(sbx) {
  const listBuf = await sbx.readFileToBuffer({ path: "/tmp/fizz-changed" });
  const paths = String(listBuf || "").split("\n").map((l) => l.replace(/^\.\//, "").trim()).filter(Boolean).slice(0, 100);
  const out = {};
  for (const p of paths) {
    const b = await sbx.readFileToBuffer({ path: `${APP}/${p}` });
    if (!b) continue;
    const text = b.toString("utf8");
    out[p] = /[\u0000-\u0008\u000E-\u001F]/.test(text.slice(0, 2000)) ? { base64: b.toString("base64") } : text;
  }
  return out;
}

/** Picks up a command that was still running. */
export async function wait({ userId, projectId, cmdId, waitMs = 45000 }) {
  const sbx = await open(userId, projectId);
  const command = await sbx.getCommand(cmdId);
  return collect(sbx, command, waitMs);
}

export async function stop({ userId, projectId }) {
  const sbx = await open(userId, projectId);
  await sbx.stop();
  return { stopped: true };
}
