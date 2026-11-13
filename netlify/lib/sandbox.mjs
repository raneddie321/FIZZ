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

// ---------------- big repositories that live in the sandbox ----------------
// The repository is cloned into the project's sandbox and stays there; the browser fetches only the files Fizz Code
// reads. A private repository's token goes in a file (never on a command line, which the sandbox logs keep) and is
// deleted right after the clone.
const q = (s) => `'${String(s).replace(/'/g, "'\\''")}'`;
const validRepoUrl = (u) => /^https:\/\/github\.com\/[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}(\.git)?$/.test(String(u || ""));
const validBranch = (s) => /^[A-Za-z0-9._/-]{1,200}$/.test(s || "") && !String(s).includes("..");
const TREE_MAX = 20000;

async function sh(sbx, script, timeoutMs = 50_000) {
  const command = await sbx.runCommand({ cmd: "bash", args: ["-c", script], detached: true });
  const done = await Promise.race([command.wait(), new Promise((r) => setTimeout(() => r(null), timeoutMs))]);
  if (!done) return { code: 124, out: (await safeOutput(command)).slice(-4000) };
  return { code: done.exitCode, out: await done.stdout().catch(() => ""), err: await done.stderr().catch(() => "") };
}
function treeOf(out) {
  return String(out || "").split("\n").filter(Boolean).slice(0, TREE_MAX).map((l) => { const i = l.indexOf("\t"); return { size: Number(l.slice(0, i)) || 0, path: l.slice(i + 1) }; }).filter((e) => e.path);
}
const TREE_CMD = `cd ${APP} && find . -type f -not -path './.git/*' -not -path '*/node_modules/*' -printf '%s\\t%P\\n' | sort -k2 | head -n ${TREE_MAX}`;

/** git clone (shallow) into the sandbox. → { tree: [{ path, size }], files: count, branch, sha } */
export async function clone({ userId, projectId, url, branch = "", token = "" }) {
  if (!validRepoUrl(url)) throw Object.assign(new Error("Only https://github.com/owner/repo repositories can be cloned."), { status: 400 });
  if (branch && !validBranch(branch)) throw Object.assign(new Error("Invalid branch."), { status: 400 });
  const sbx = await open(userId, projectId);
  const cred = "/tmp/fizz-git-cred";
  if (token) await sbx.writeFiles([{ path: cred, content: Buffer.from(String(token)) }]);
  const auth = token ? `-c credential.helper='!f() { echo username=x-access-token; echo "password=$(cat ${cred})"; }; f'` : "";
  const script = `rm -rf ${APP} && mkdir -p ${APP} && git ${auth} clone --depth 1 --single-branch ${branch ? `--branch ${q(branch)} ` : ""}${q(url)} ${APP} 2>&1; code=$?; rm -f ${cred}; exit $code`;
  const r = await sh(sbx, script, 55_000);
  if (r.code !== 0) throw Object.assign(new Error(`git clone failed: ${String(r.out || r.err || "").replace(/x-access-token:[^@\s]+@/g, "").slice(-600)}`), { status: 400 });
  const info = await sh(sbx, `cd ${APP} && git rev-parse --abbrev-ref HEAD && git rev-parse HEAD`);
  const [head, sha] = String(info.out || "").trim().split("\n");
  const tree = treeOf((await sh(sbx, TREE_CMD)).out);
  return { tree, files: tree.length, branch: head || branch, sha: sha || "" };
}

/**
 * Looks at the repository in the sandbox without running anything the user wrote:
 *   tree → [{ path, size }] · grep (pattern, path, glob, ignoreCase, max) → [{ path, line, text }] · read (paths) → { path: text }
 */
export async function look({ userId, projectId, kind, pattern = "", path = "", glob = "", ignoreCase = false, max = 80, paths = [] }) {
  const sbx = await open(userId, projectId);
  const there = await sh(sbx, `test -d ${APP}/.git && echo yes`);
  if (!String(there.out).includes("yes")) throw Object.assign(new Error("The repository isn't in the cloud sandbox any more (it was reset). Clone it again from the project's menu."), { status: 410, code: "gone" });
  if (kind === "tree") return { tree: treeOf((await sh(sbx, TREE_CMD)).out) };
  if (kind === "grep") {
    if (!String(pattern).trim() || String(pattern).length > 300) throw Object.assign(new Error("Give a pattern (up to 300 characters)."), { status: 400 });
    const base = safeProjectPath(String(path || "").replace(/\/+$/, "")) || "";
    const spec = glob ? `:(glob)${base ? `${base}/` : ""}${glob.includes("/") ? glob : `**/${glob}`}` : base || ".";
    const n = Math.min(200, Math.max(1, Number(max) || 80));
    const r = await sh(sbx, `cd ${APP} && git grep -n -I --no-color ${ignoreCase ? "-i " : ""}-E -e ${q(pattern)} -- ${q(spec)} | head -n ${n + 1}`);
    const lines = String(r.out || "").split("\n").filter(Boolean);
    const matches = lines.slice(0, n).map((l) => { const m = /^(.*?):(\d+):(.*)$/.exec(l); return m ? { path: m[1], line: Number(m[2]), text: m[3].trim().slice(0, 240) } : null; }).filter(Boolean);
    return { matches, truncated: lines.length > n, error: r.code > 1 ? String(r.err || "").slice(0, 300) : "" };
  }
  if (kind === "read") {
    const out = {};
    let total = 0;
    for (const p of (Array.isArray(paths) ? paths : []).slice(0, 20)) {
      const safe = safeProjectPath(p);
      if (!safe) continue;
      const b = await sbx.readFileToBuffer({ path: `${APP}/${safe}` });
      if (!b) { out[safe] = null; continue; }
      if (b.length > 2_000_000 || total + b.length > 4_000_000) { out[safe] = { tooBig: b.length }; continue; }
      total += b.length;
      const text = b.toString("utf8");
      out[safe] = /[\u0000]/.test(text.slice(0, 8000)) ? { binary: b.length } : text;
    }
    return { files: out };
  }
  throw Object.assign(new Error("Unknown look."), { status: 400 });
}

// ---------------- Fizz Code's cloud runner ----------------
// A task runs in the sandbox (netlify/lib/runner/agent-runner.mjs) so it keeps going when the page is closed or the
// phone locks; the page polls its progress. Runs live under /vercel/sandbox/fizz-run/<runId>.
const RUNS = "/vercel/sandbox/fizz-run";
const validRunId = (s) => /^[a-z0-9]{8,40}$/.test(String(s || ""));

/** Copies the project in, writes the runner and its input, and starts it in the background. → { runId } */
export async function agentStart({ userId, projectId, files = {}, input, runId, token, origin }) {
  const { AGENT_CORE_SOURCE, RUNNER_SOURCE } = await import("./runner/bundle.mjs");
  if (!validRunId(runId)) throw Object.assign(new Error("Bad run id."), { status: 400 });
  const list = [];
  for (const [original, content] of Object.entries(files || {})) {
    if (typeof content !== "string" || original.split("/").some((part) => part === "node_modules")) continue;
    const p = safeProjectPath(original);
    if (p) list.push([p, content]);
  }
  if (list.length > FILE_LIMIT) throw Object.assign(new Error(`Too many project files (maximum ${FILE_LIMIT}).`), { status: 413 });
  if (list.reduce((n, [, v]) => n + Buffer.byteLength(v, "utf8"), 0) > TEXT_LIMIT) throw Object.assign(new Error("The project is too large to run in the cloud (over 3 MB of text)."), { status: 413 });
  const sbx = await open(userId, projectId);
  try { await sbx.extendTimeout?.(30 * 60 * 1000); } catch {}
  const dir = `${RUNS}/${runId}`;
  await sbx.runCommand({ cmd: "mkdir", args: ["-p", APP, dir] });
  const body = { ...input, files: Object.fromEntries(list), appDir: APP, origin, token, sandboxUrl: sbx.domain(PORT) };
  await sbx.writeFiles([
    ...list.map(([p, v]) => ({ path: `${APP}/${p}`, content: Buffer.from(v) })),
    { path: `${RUNS}/agent-core.mjs`, content: Buffer.from(AGENT_CORE_SOURCE) },
    { path: `${RUNS}/agent-runner.mjs`, content: Buffer.from(RUNNER_SOURCE) },
    { path: `${dir}/input.json`, content: Buffer.from(JSON.stringify(body)) },
  ]);
  // Detached: the runner keeps going after this function returns (the same way background commands do).
  await sbx.runCommand({ cmd: "bash", args: ["-c", `cd ${dir} && exec node ${RUNS}/agent-runner.mjs ${dir} > ${dir}/log.txt 2>&1`], detached: true });
  return { runId };
}

/** The run's progress: { status, steps, error } — steps from index `from` on. */
export async function agentPoll({ userId, projectId, runId, from = 0 }) {
  if (!validRunId(runId)) throw Object.assign(new Error("Bad run id."), { status: 400 });
  const sbx = await open(userId, projectId);
  const buf = await sbx.readFileToBuffer({ path: `${RUNS}/${runId}/state.json` }).catch(() => null);
  if (!buf) {
    const log = await sbx.readFileToBuffer({ path: `${RUNS}/${runId}/log.txt` }).catch(() => null);
    const input = await sbx.readFileToBuffer({ path: `${RUNS}/${runId}/input.json` }).catch(() => null);
    if (!input) return { status: "lost", steps: [], error: "The cloud run isn't there any more (the sandbox restarted)." };
    return { status: log && /Error/.test(log.toString()) ? "error" : "starting", steps: [], error: log ? log.toString().slice(-1500) : "" };
  }
  const state = JSON.parse(buf.toString("utf8"));
  // A runner that stopped writing for 3 minutes while "running" has died with the sandbox process.
  if (state.status === "running" && Date.now() - state.updatedAt > 3 * 60_000) { state.status = "error"; state.error = "The cloud run stopped responding."; }
  const start = Math.max(0, Math.min(Number(from) || 0, state.steps.length));
  return { status: state.status, error: state.error || "", total: state.steps.length, from: start, steps: state.steps.slice(start) };
}

export async function agentStop({ userId, projectId, runId }) {
  if (!validRunId(runId)) throw Object.assign(new Error("Bad run id."), { status: 400 });
  const sbx = await open(userId, projectId);
  await sbx.writeFiles([{ path: `${RUNS}/${runId}/stop`, content: Buffer.from("1") }]);
  return { stopping: true };
}
