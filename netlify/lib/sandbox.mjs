// Fizz Code's own Linux sandbox (Vercel Sandbox: a Firecracker microVM with Node 22, npm, git, Python).
// One named sandbox per user and project; the project's text files are copied in before each command and
// files the command creates or changes come back. Turned on with FIZZ_SANDBOX=on on a Vercel deployment.
import { createHash } from "node:crypto";
import { posix as path } from "node:path";
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
// On by default on Vercel (Vercel Sandbox needs no key there); FIZZ_SANDBOX=off turns it off.
export const sandboxEnabled = () => env("FIZZ_SANDBOX") === "on" || (env("FIZZ_SANDBOX") !== "off" && Boolean(env("VERCEL")));
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
const FILE_LIMIT = 500;
const FILE_PATH_LIMIT = 240;
const COMMAND_LIMIT = 2000;

// File names come from the browser project model. Keep every uploaded file inside APP;
// the sandbox is isolated, but path traversal must not be allowed to overwrite other VM paths.
function safeProjectPath(input) {
  if (typeof input !== "string" || !input || input.length > FILE_PATH_LIMIT || input.includes(String.fromCharCode(0))) return null;
  const normalized = input.split(String.fromCharCode(92)).join("/");
  if (normalized.startsWith("/") || /^[a-zA-Z]:/.test(normalized)) return null;
  const segments = normalized.split("/");
  if (segments.some((part) => part === ".." || part === "." || part === "")) return null;
  const clean = path.normalize(normalized);
  if (!clean || clean === "." || clean.startsWith("../") || clean.startsWith("/")) return null;
  return clean;
}
/**
 * Runs one shell command. Waits up to `waitMs` (default 45 s, inside the function's time limit);
 * long commands keep running and are picked up with wait().
 */
export async function run({ userId, projectId, files = {}, cmd, waitMs = 45000, background = false }) {
  if (!cmd || typeof cmd !== "string" || !cmd.trim()) throw Object.assign(new Error("A command is required."), { status: 400 });
  if (cmd.length > COMMAND_LIMIT) throw Object.assign(new Error("The command is too long (maximum 2,000 characters)."), { status: 413 });
  if (!files || typeof files !== "object" || Array.isArray(files)) throw Object.assign(new Error("Project files must be an object."), { status: 400 });

  const entries = Object.entries(files);
  if (entries.length > FILE_LIMIT) throw Object.assign(new Error(`Too many project files (maximum ${FILE_LIMIT}).`), { status: 413 });
  const list = [];
  for (const [original, content] of entries) {
    if (typeof content !== "string" || original.split("/").some((part) => part === "node_modules")) continue;
    const projectPath = safeProjectPath(original);
    if (!projectPath) throw Object.assign(new Error(`Unsafe project file path: ${original.slice(0, 80)}`), { status: 400 });
    list.push([projectPath, content]);
  }
  const total = list.reduce((n, [, value]) => n + Buffer.byteLength(value, "utf8"), 0);
  if (total > TEXT_LIMIT) throw Object.assign(new Error("The project is too large to copy into the sandbox (over 3 MB of text)."), { status: 413 });

  const sbx = await open(userId, projectId);
  const boundedWaitMs = Number.isFinite(Number(waitMs)) ? Math.max(1000, Math.min(45000, Number(waitMs))) : 45000;
  await sbx.runCommand({ cmd: "mkdir", args: ["-p", APP] });
  if (list.length) await sbx.writeFiles(list.map(([projectPath, value]) => ({ path: `${APP}/${projectPath}`, content: Buffer.from(value) })));
  const script = `cd ${APP} && touch /tmp/fizz-start && (${cmd}) 2>&1; code=$?; find . -newer /tmp/fizz-start -type f -not -path './node_modules/*' -not -path './.git/*' -not -path '*/__pycache__/*' -size -400k 2>/dev/null | head -100 > /tmp/fizz-changed; exit $code`;
  const command = await sbx.runCommand({ cmd: "bash", args: ["-lc", script], detached: true });
  if (background) return { running: true, cmdId: command.cmdId, url: sbx.domain(PORT), text: `Started in the background. If it serves on port ${PORT}, it's at ${sbx.domain(PORT)}` };
  return collect(sbx, command, boundedWaitMs);
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
