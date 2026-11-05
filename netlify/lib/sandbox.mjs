// Fizz Code's own Linux sandbox (Vercel Sandbox: a Firecracker microVM with Node 22, npm, git, Python).
// One named sandbox per user and project; the project's text files are copied in before each command and
// files the command creates or changes come back. Turned on with FIZZ_SANDBOX=on on a Vercel deployment.
import { createHash, randomUUID } from "node:crypto";
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
const MAX_CHANGED_FILES = 200;
const MAX_DELETED_FILES = 500;
const MAX_SYNC_BYTES = 2_500_000;
const RUN_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// File names come from the browser project model. Keep every uploaded file inside APP;
// the sandbox is isolated, but path traversal must not be allowed to overwrite other VM paths.
function safeProjectPath(input) {
  if (typeof input !== "string" || !input || input.length > FILE_PATH_LIMIT || /[\u0000-\u001f\u007f]/.test(input)) return null;
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
    if (typeof content !== "string") continue;
    const projectPath = safeProjectPath(original);
    if (!projectPath) throw Object.assign(new Error(`Unsafe project file path: ${original.slice(0, 80)}`), { status: 400 });
    if (projectPath.split("/").includes("node_modules")) continue;
    list.push([projectPath, content]);
  }
  const total = list.reduce((n, [, value]) => n + Buffer.byteLength(value, "utf8"), 0);
  if (total > TEXT_LIMIT) throw Object.assign(new Error("The project is too large to copy into the sandbox (over 3 MB of text)."), { status: 413 });

  const sbx = await open(userId, projectId);
  const boundedWaitMs = Number.isFinite(Number(waitMs)) ? Math.max(1000, Math.min(45000, Number(waitMs))) : 45000;

  // Keep a server-side manifest of the text files synced from the browser. Later commands
  // can remove files the user deleted without touching node_modules or generated build output.
  const manifestPath = `/tmp/${sandboxName(userId, projectId)}-manifest.json`;
  let previousPaths = [];
  try {
    const previous = await sbx.readFileToBuffer({ path: manifestPath });
    const parsed = previous ? JSON.parse(previous.toString("utf8")) : [];
    if (Array.isArray(parsed)) previousPaths = parsed.filter((p) => safeProjectPath(p));
  } catch {}
  const currentPaths = new Set(list.map(([projectPath]) => projectPath));
  const stalePaths = previousPaths.filter((p) => !currentPaths.has(p));
  if (stalePaths.length) {
    const quote = (value) => "'" + String(value).replace(/'/g, "'\\''") + "'";
    const cleanup = stalePaths.map((p) => {
      const target = quote(`${APP}/${p}`);
      return `if [ -f ${target} ] || [ -L ${target} ]; then rm -f -- ${target}; fi`;
    }).join("\n");
    await sbx.runCommand({ cmd: "bash", args: ["-lc", cleanup] });
  }
  await sbx.runCommand({ cmd: "mkdir", args: ["-p", APP] });
  const synced = list.map(([projectPath, value]) => ({ path: `${APP}/${projectPath}`, content: Buffer.from(value) }));
  synced.push({ path: manifestPath, content: Buffer.from(JSON.stringify([...currentPaths].sort())) });
  await sbx.writeFiles(synced);

  // Each command owns its metadata files. Parallel runs no longer overwrite one another's
  // before/after/changed/deleted lists.
  const runId = randomUUID();
  const meta = `/tmp/fizz-${runId}`;
  const beforePath = meta + "-before";
  const startedPath = meta + "-start";
  const changedPath = meta + "-changed";
  const afterPath = meta + "-after";
  const deletedPath = meta + "-deleted";
  const script = [
    `cd ${APP} || exit $?`,
    `find . -type f -not -path './node_modules/*' -not -path './.git/*' -not -path '*/__pycache__/*' 2>/dev/null | sort > ${beforePath}`,
    `touch ${startedPath}`,
    `(${cmd}) 2>&1`,
    "code=$?",
    `find . -newer ${startedPath} -type f -not -path './node_modules/*' -not -path './.git/*' -not -path './.next/*' -not -path './dist/*' -not -path './build/*' -not -path '*/__pycache__/*' 2>/dev/null | sort > ${changedPath}`,
    `find . -type f -not -path './node_modules/*' -not -path './.git/*' -not -path './.next/*' -not -path './dist/*' -not -path './build/*' -not -path '*/__pycache__/*' 2>/dev/null | sort > ${afterPath}`,
    `comm -23 ${beforePath} ${afterPath} | sort > ${deletedPath}`,
    "exit $code",
  ].join("\n");
  const command = await sbx.runCommand({ cmd: "bash", args: ["-lc", script], detached: true });
  if (background) return { running: true, cmdId: command.cmdId, runId, url: sbx.domain(PORT), text: `Started in the background. If it serves on port ${PORT}, it's at ${sbx.domain(PORT)}` };
  return collect(sbx, command, boundedWaitMs, runId);
}

function trackingPath(runId, suffix) {
  const legacy = { before: "before", start: "start", changed: "changed", after: "after", deleted: "deleted" };
  return RUN_ID_RE.test(String(runId || "")) ? `/tmp/fizz-${runId}-${suffix}` : `/tmp/fizz-${legacy[suffix]}`;
}
async function collect(sbx, command, waitMs, runId = null) {
  let timer;
  let done;
  try {
    const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve(null), waitMs); });
    done = await Promise.race([command.wait(), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
  if (!done) return { running: true, cmdId: command.cmdId, runId, text: (await safeOutput(command)).slice(-6000) };
  const text = (await done.output("both")).slice(-20000);
  const [changed, deleted] = await Promise.all([changedFiles(sbx, runId), deletedFiles(sbx, runId)]);
  return {
    running: false, exitCode: done.exitCode, text, files: changed.files, deleted: deleted.files,
    syncWarnings: [...changed.warnings, ...deleted.warnings], runId, url: sbx.domain(PORT),
  };
}
const safeOutput = async (c) => { try { return await c.output("both"); } catch { return ""; } };

async function changedFiles(sbx, runId = null) {
  let listBuf;
  try { listBuf = await sbx.readFileToBuffer({ path: trackingPath(runId, "changed") }); }
  catch (error) { return { files: {}, warnings: [`Couldn't read the changed-file list: ${error.message || error}`] }; }
  const all = [...new Set(String(listBuf || "").split("\n").map((l) => l.replace(/^\.\//, "").trim()).filter(Boolean))];
  const warnings = [];
  if (all.length > MAX_CHANGED_FILES) warnings.push(`Only the first ${MAX_CHANGED_FILES} changed files were synced; ${all.length - MAX_CHANGED_FILES} more need to be inspected or synced in a follow-up command.`);
  const out = {};
  let totalBytes = 0;
  for (const p of all.slice(0, MAX_CHANGED_FILES)) {
    if (!safeProjectPath(p)) { warnings.push(`Skipped an unsafe changed-file path: ${p.slice(0, 100)}`); continue; }
    let b;
    try { b = await sbx.readFileToBuffer({ path: `${APP}/${p}` }); }
    catch (error) { warnings.push(`Couldn't read changed file ${p}: ${error.message || error}`); continue; }
    if (!b) { warnings.push(`Changed file disappeared before sync: ${p}`); continue; }
    if (totalBytes + b.length > MAX_SYNC_BYTES) {
      warnings.push(`Stopped syncing at ${(MAX_SYNC_BYTES / 1_000_000).toFixed(1)} MB; ${p} and later changed files were not returned to the project.`);
      break;
    }
    totalBytes += b.length;
    const text = b.toString("utf8");
    const isBinary = !Buffer.from(text, "utf8").equals(b) || /[\\u0000-\\u0008\\u000E-\\u001F]/.test(text.slice(0, 2000));
    out[p] = isBinary ? { base64: b.toString("base64") } : text;
  }
  return { files: out, warnings };
}

async function deletedFiles(sbx, runId = null) {
  let listBuf;
  try { listBuf = await sbx.readFileToBuffer({ path: trackingPath(runId, "deleted") }); }
  catch (error) { return { files: [], warnings: [`Couldn't read the deleted-file list: ${error.message || error}`] }; }
  const all = [...new Set(String(listBuf || "").split("\n").map((line) => (line.startsWith("./") ? line.slice(2) : line).trim()).filter(Boolean))];
  const files = all.filter((path) => safeProjectPath(path)).slice(0, MAX_DELETED_FILES);
  const warnings = [];
  if (files.length < all.length) warnings.push(`Only ${MAX_DELETED_FILES} deleted paths were returned; ${all.length - files.length} more deletions were not synced.`);
  return { files, warnings };
}

/** Picks up a command that was still running. */
export async function wait({ userId, projectId, cmdId, runId = null, waitMs = 45000 }) {
  if (!cmdId || String(cmdId).length > 200) throw Object.assign(new Error("A valid command id is required."), { status: 400 });
  if (runId && !RUN_ID_RE.test(String(runId))) throw Object.assign(new Error("The sandbox run id is invalid."), { status: 400 });
  const sbx = await open(userId, projectId);
  const command = await sbx.getCommand(cmdId);
  if (!command) throw Object.assign(new Error("That sandbox command could not be found."), { status: 404 });
  return collect(sbx, command, waitMs, runId);
}

export async function stop({ userId, projectId }) {
  const sbx = await open(userId, projectId);
  await sbx.stop();
  return { stopped: true };
}
