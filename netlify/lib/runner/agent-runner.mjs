// FIZZ DEV's cloud runner: Fizz Code's loop, running in the user's cloud sandbox so a task keeps going after the
// page is closed or the phone locks. Started by api/sandbox (action "agent-start") as `node agent-runner.mjs <dir>`.
//
// It does what it can on its own — writes files, runs commands, searches the web, reads pages, looks through the
// project — and writes its progress to <dir>/state.json, which the page reads back. Anything it can't do here (a
// connected app, the cloud browser, pushing, a question for the user) or that needs the user's OK stops the run as a
// "handoff": the page picks up from exactly that point when it's open again, with its own permission gate.
//
// It never holds the user's keys: model calls and web searches go through FIZZ with a short-lived run token that only
// allows those two things.
import { readFile, writeFile, rename, mkdir, access } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import * as C from "./agent-core.mjs";

const DIR = process.argv[2];
const input = JSON.parse(await readFile(join(DIR, "input.json"), "utf8"));
const APP = input.appDir;
const SUPPORTED = new Set(["run", "sandbox", "search", "fetch", "tree", "grep", "read", "symbols"]);
const FEEDBACK = SUPPORTED; // every tool the runner runs sends its result back
const SECRET = /(^|\/)\.env(\.(?!example$|sample$|template$)[^/]*)?$/;
const files = { ...input.files };
const state = { status: "running", steps: [], error: "", startedAt: Date.now(), updatedAt: Date.now() };
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

let saving = null, again = false;
async function save() {
  state.updatedAt = Date.now();
  if (saving) { again = true; return saving; }
  saving = (async () => {
    do {
      again = false;
      const tmp = join(DIR, `state.${process.pid}.tmp`);
      await writeFile(tmp, JSON.stringify(state));
      await rename(tmp, join(DIR, "state.json"));
    } while (again);
  })().finally(() => { saving = null; });
  return saving;
}
const stopped = async () => { try { await access(join(DIR, "stop")); return true; } catch { return false; } };

// ---------- the model, through FIZZ ----------
async function callModel(messages, onText) {
  const res = await fetch(`${input.origin}/api/ai/chat`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-fizz-run": input.token },
    body: JSON.stringify({ system: input.system, messages, model: input.model || undefined }),
  });
  if (!res.ok) {
    let msg = `The AI service returned an error (${res.status}).`;
    try { msg = (await res.json()).error?.message || msg; } catch {}
    throw Object.assign(new Error(msg), { status: res.status });
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "", text = "", stop = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      let j;
      try { j = JSON.parse(data); } catch { continue; }
      if (j.error) throw new Error(j.error.message || "The AI service failed.");
      // OpenAI-compatible and Anthropic streams.
      const piece = j.choices?.[0]?.delta?.content ?? (j.type === "content_block_delta" ? j.delta?.text : "") ?? "";
      const fin = j.choices?.[0]?.finish_reason || (j.type === "message_delta" ? j.delta?.stop_reason : null);
      if (fin) stop = fin === "length" || fin === "max_tokens" ? "max_tokens" : fin;
      if (piece) { text += piece; onText(text); }
    }
  }
  return { text, stop };
}

// ---------- tools ----------
const first = (s) => String(s || "").split("\n")[0].trim().slice(0, 500);
const clean = (p) => String(p || "").trim().replace(/^\.?\/+/, "").replace(/\/+$/, "");
const DESCRIBE = {
  run: (t) => ({ kind: "run", target: first(t.body) }),
  sandbox: (t) => ({ kind: "run", target: first(t.body) }),
  search: (t) => ({ kind: "network", target: `search ${first(t.body)}`, readOnly: true }),
  fetch: (t) => ({ kind: "network", target: `fetch ${t.attrs.url || first(t.body)}`, readOnly: true }),
  tree: (t) => ({ kind: "read", target: `tree ${clean(t.attrs.path)}`, readOnly: true }),
  grep: (t) => ({ kind: "read", target: `grep ${String(t.attrs.pattern || t.body).slice(0, 120)}`, readOnly: true }),
  read: (t) => ({ kind: "read", target: `read ${clean(t.attrs.path)}`, readOnly: true }),
  symbols: (t) => ({ kind: "read", target: `symbols ${clean(t.attrs.path)}`, readOnly: true }),
};
function allowed(t) {
  const d = DESCRIBE[t.type]?.(t);
  if (!d) return false;
  const r = C.decidePermission({ mode: input.perm.mode, rules: input.perm.rules, project: input.perm.project, projectTrusted: input.perm.projectTrusted, kind: d.kind, target: d.target, readOnly: d.readOnly, planApproved: true });
  return r.decision === "allow";
}

async function web(path) {
  const res = await fetch(`${input.origin}${path}`, { headers: { "x-fizz-run": input.token } });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error?.message || `FIZZ returned ${res.status}.`);
  return j;
}

function sh(cmd, { timeoutMs = 10 * 60_000, background = false } = {}) {
  return new Promise((resolve) => {
    const script = `cd ${APP} && touch /tmp/fizz-run-start && (${cmd}) 2>&1; code=$?; find . -newer /tmp/fizz-run-start -type f -not -path './node_modules/*' -not -path './.git/*' -not -path '*/__pycache__/*' -size -400k 2>/dev/null | head -100 > /tmp/fizz-run-changed; exit $code`;
    const child = spawn("bash", ["-lc", script], { detached: background, stdio: background ? "ignore" : ["ignore", "pipe", "pipe"] });
    if (background) { child.unref(); return resolve({ code: 0, out: `Started in the background.${input.sandboxUrl ? ` If it serves on port 3000, it's at ${input.sandboxUrl}` : ""}` }); }
    let out = "";
    const add = (b) => { out += b.toString(); if (out.length > 200_000) out = out.slice(-100_000); };
    child.stdout.on("data", add);
    child.stderr.on("data", add);
    const timer = setTimeout(() => { try { process.kill(-child.pid); } catch {} child.kill("SIGKILL"); out += `\n[Stopped after ${Math.round(timeoutMs / 60000)} minutes.]`; }, timeoutMs);
    child.on("close", (code) => { clearTimeout(timer); resolve({ code: code ?? 124, out: out.slice(-20_000) }); });
  });
}
async function changedFiles() {
  const list = (await readFile("/tmp/fizz-run-changed", "utf8").catch(() => "")).split("\n").map((l) => l.replace(/^\.\//, "").trim()).filter(Boolean).slice(0, 100);
  const out = {};
  for (const p of list) {
    const b = await readFile(join(APP, p)).catch(() => null);
    if (!b) continue;
    const text = b.toString("utf8");
    if (/[\u0000-\u0008\u000E-\u001F]/.test(text.slice(0, 2000))) out[p] = { base64: b.toString("base64") };
    else { out[p] = text; files[p] = text; }
  }
  return out;
}
function find(raw) {
  const path = clean(raw);
  if (typeof files[path] === "string") return { path };
  const name = path.split("/").pop().toLowerCase(), stem = name.replace(/\.[^.]+$/, "");
  const near = Object.keys(files).filter((f) => { const b = f.toLowerCase().split("/").pop(); return b === name || b.replace(/\.[^.]+$/, "") === stem; }).slice(0, 5);
  return { miss: `There is no file ${path || "(no path given)"}.${near.length ? ` Did you mean: ${near.join(", ")}?` : " Use <fizz-tree/> to see what exists."}` };
}
const mask = (text) => String(text).split("\n").map((l) => (/^\s*(export\s+)?[A-Za-z_][\w.]*\s*=/.test(l) ? l.replace(/=.*$/, "=•••• (set — the value is hidden from you)") : l)).join("\n");

async function runTool(t) {
  switch (t.type) {
    case "run":
    case "sandbox": {
      const cmd = t.body.trim();
      if (!cmd) return { ok: false, text: "The command was empty." };
      const bg = t.attrs.background === "true";
      const r = await sh(cmd, { background: bg });
      const changed = bg ? {} : await changedFiles();
      const names = Object.keys(changed);
      return { ok: r.code === 0, text: `$ ${first(cmd)}\n${r.out || "(no output)"}\n[exit code ${r.code}]${names.length ? `\nChanged files: ${names.join(", ")}` : ""}`, files: changed, cloud: true };
    }
    case "search": {
      const q = (t.body || t.attrs.q || "").trim();
      if (!q) return { ok: false, text: "The search was empty." };
      const r = await web(`/api/web/search?${new URLSearchParams({ q, count: "8" })}`);
      if (!r.results?.length) return { ok: true, text: `No results for “${q}”.` };
      return { ok: true, text: `Results for “${q}” (${r.provider}):\n` + r.results.map((x, i) => `${i + 1}. ${x.title} — ${x.url}${x.snippet ? `\n   ${x.snippet}` : ""}`).join("\n") };
    }
    case "fetch": {
      const url = (t.attrs.url || t.body || "").trim();
      if (!/^https?:\/\//i.test(url)) return { ok: false, text: "Give a full link that starts with https://." };
      const r = await web(`/api/web/read?${new URLSearchParams({ url })}`);
      return { ok: !(r.status >= 400), text: `${r.title ? `# ${r.title}\n` : ""}${r.url}${r.status && r.status >= 400 ? ` (HTTP ${r.status})` : ""}\n\n${r.text}${r.truncated ? "\n\n[The page was longer; this is the start.]" : ""}` };
    }
    case "tree": {
      const depth = Math.min(8, Math.max(1, Number(t.attrs.depth) || 3));
      return { ok: true, text: C.treeText(Object.entries(files).map(([path, v]) => ({ path, size: typeof v === "string" ? v.length : 0 })), { path: clean(t.attrs.path), depth, max: 400 }) };
    }
    case "grep": {
      const pattern = String(t.attrs.pattern || t.body || "");
      if (!pattern.trim()) return { ok: false, text: 'Give a pattern to search for: <fizz-grep pattern="…"/>.' };
      const max = Math.min(200, Math.max(1, Number(t.attrs.max) || 80));
      const r = C.grepFiles(files, { pattern, path: clean(t.attrs.path), glob: t.attrs.glob || "", ignoreCase: t.attrs["ignore-case"] === "true", max, skip: (p, text) => typeof text !== "string" || SECRET.test(p) || text.length > 1_500_000 });
      if (!r.matches.length) return { ok: true, text: `No matches for ${pattern}.` };
      return { ok: true, text: `${r.matches.length}${r.truncated ? "+" : ""} match${r.matches.length === 1 ? "" : "es"} in ${r.files} file${r.files === 1 ? "" : "s"}:\n${r.matches.map((m) => `${m.path}:${m.line}: ${m.text}`).join("\n")}` };
    }
    case "read": {
      const f = find(t.attrs.path || t.body);
      if (f.miss) return { ok: false, text: f.miss };
      const r = C.readLines(SECRET.test(f.path) ? mask(files[f.path]) : files[f.path], t.attrs.lines || "");
      return { ok: true, text: `${f.path} — lines ${r.from}–${r.to} of ${r.total}:\n${r.text}${r.more ? `\n… ${r.total - r.to} more lines: ask for lines="${r.to + 1}-${Math.min(r.total, r.to + 400)}".` : ""}` };
    }
    case "symbols": {
      const f = find(t.attrs.path || t.body);
      if (f.miss) return { ok: false, text: f.miss };
      if (SECRET.test(f.path)) return { ok: true, text: `${f.path} has no outline (secret).` };
      const list = C.symbolsOf(files[f.path], f.path);
      return { ok: true, text: list.length ? `${f.path} — ${list.length} symbols:\n${list.map((x) => `${String(x.line).padStart(5)}  ${x.text}`).join("\n")}` : `${f.path} has no symbols I can outline.` };
    }
  }
  return { ok: false, text: "Not available in the cloud." };
}

// ---------- files the reply writes ----------
async function writeProjectFile(path, content) {
  files[path] = content;
  const full = join(APP, path);
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, content);
}
async function applyReply(reply, parsed) {
  const errors = {};
  if (reply.mode !== "build" && reply.mode !== "do") return errors;
  const proposals = [];
  for (const f of parsed.files) if (f.closed && C.validPath(f.path)) proposals.push({ path: f.path, after: f.content });
  for (const e of parsed.edits) {
    if (!e.closed || !C.validPath(e.path)) continue;
    const current = proposals.findLast((x) => x.path === e.path)?.after ?? files[e.path];
    if (typeof current !== "string") { errors[e.path] = `${e.path} doesn't exist yet (or isn't a text file): write it whole with <fizz-file>.`; continue; }
    const r = C.applyHunks(current, e.hunks);
    if (r.error) errors[e.path] = r.error;
    else proposals.push({ path: e.path, after: r.text });
  }
  for (const x of proposals) {
    const perm = C.decidePermission({ mode: input.perm.mode, rules: input.perm.rules, project: input.perm.project, projectTrusted: input.perm.projectTrusted, kind: "edit", target: x.path, planApproved: true });
    if (perm.decision === "deny") { errors[x.path] = `Blocked: ${perm.message || "a rule doesn't allow editing this file."}`; continue; }
    await writeProjectFile(x.path, x.after);
  }
  return errors;
}

// ---------- FIZZ chat: one answer, with up to 3 rounds of web searches and page reads ----------
async function chatRun() {
  const TAG = /<(search|fetch)>([\s\S]*?)<\/\1>/g;
  const reply = { id: input.replyId || uid(), role: "assistant", content: "", pending: true, model: input.modelLabel || "", at: Date.now(), working: [] };
  state.steps.push({ reply });
  await save();
  const msgs = input.messages.slice();
  let used = 0;
  for (let round = 0; round <= 3; round++) {
    if (await stopped()) { reply.pending = false; await finish("stopped"); }
    let last = 0;
    let r;
    try { r = await callModel(msgs, (full) => { reply.content = full; const now = Date.now(); if (now - last > 800) { last = now; save(); } }); }
    catch (e) { reply.pending = false; reply.error = e.message; reply.noKey = [404, 429, 503].includes(e.status); await finish("error", e.message); }
    reply.content = r.text;
    if (r.stop === "max_tokens") reply.content += "\n\n*The response reached its maximum length.*";
    if (!input.web || round === 3) break;
    const calls = [...reply.content.matchAll(TAG)].map((m) => ({ kind: m[1], arg: m[2].trim() })).filter((c) => c.arg && (c.kind === "search" || /^https?:\/\//i.test(c.arg))).slice(0, 6);
    if (!calls.length || used >= 6) break;
    const results = [];
    for (const c of calls) {
      used++;
      reply.working = [c.kind === "search" ? `Searching the web for “${c.arg.slice(0, 80)}”` : `Reading ${c.arg.replace(/^https?:\/\/(www\.)?/, "").split("/")[0]}`];
      await save();
      const q = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
      try {
        if (c.kind === "search") {
          const w = await web(`/api/web/search?${new URLSearchParams({ q: c.arg, count: "8" })}`);
          results.push((w.results || []).length ? `<search-results query="${q(c.arg)}">\n${w.results.map((x, i) => `${i + 1}. ${x.title} — ${x.url}${x.snippet ? `\n   ${x.snippet}` : ""}`).join("\n")}\n</search-results>` : `<search-results query="${q(c.arg)}">\nNo results found.\n</search-results>`);
        } else {
          const w = await web(`/api/web/read?${new URLSearchParams({ url: c.arg })}`);
          results.push(`<page url="${q(w.url || c.arg)}" title="${q(w.title || "")}">\n${String(w.text || "").slice(0, 12000)}${w.truncated ? "\n\n[The page was longer; this is the start.]" : ""}\n</page>`);
        }
      } catch (e) {
        results.push(c.kind === "search" ? `<search-results query="${q(c.arg)}">\nSearch failed: ${q(e.message)}\n</search-results>` : `<page url="${q(c.arg)}">\nCouldn't read this page: ${q(e.message)}\n</page>`);
      }
    }
    reply.working = [];
    msgs.push({ role: "assistant", content: reply.content });
    msgs.push({ role: "user", content: results.join("\n\n") || "<search-results>No results found.</search-results>" });
    reply.content = "";
    await save();
  }
  reply.pending = false;
  reply.working = [];
  await finish("done");
}
if (input.kind === "chat") await chatRun().catch((e) => finish("error", e.message || String(e)));

// ---------- the loop ----------
const messages = input.messages.slice();
const turn = { continues: 0, emptyBuildRetries: 0 };
const pushAuto = (label, content) => {
  const m = { id: uid(), role: "user", auto: true, autoLabel: label, content, mode: input.mode, at: Date.now() };
  state.steps.push({ auto: m });
  messages.push({ role: "user", content });
};
async function finish(status, error = "") { state.status = status; state.error = error; await save(); process.exit(0); }

try {
  for (let step = input.step || 1; ; step++) {
    if (await stopped()) await finish("stopped");
    const reply = { id: uid(), role: "assistant", content: "", pending: true, mode: input.mode, step, model: input.modelLabel || "", at: Date.now(), cloud: true };
    state.steps.push({ reply });
    await save();
    let last = 0;
    let r;
    try {
      r = await callModel(messages, (full) => { reply.content = full; const now = Date.now(); if (now - last > 800) { last = now; save(); } });
    } catch (e) {
      reply.pending = false;
      reply.error = e.message;
      reply.soft = [404, 429, 503].includes(e.status);
      await finish("error", e.message);
    }
    reply.content = r.text;
    reply.pending = false;
    if (r.stop === "max_tokens") reply.cutOff = true;
    const parsed = C.parseReply(reply.content, { fences: reply.mode === "build", known: C.TOOL_TYPES });
    const editErrors = await applyReply(reply, parsed);
    reply.tools = parsed.tools.map((t) => ({ ...t, status: "queued" }));
    await save();

    // Tools, in order; the first one the runner can't run (or that needs the user's OK) hands the task back.
    let handoff = false;
    for (const t of reply.tools) {
      if (!SUPPORTED.has(t.type) || !allowed(t)) { handoff = true; break; }
      if (await stopped()) await finish("stopped");
      t.status = "running";
      await save();
      try {
        const res = await runTool(t);
        t.result = res;
        t.status = res.ok === false ? "failed" : "done";
      } catch (e) {
        t.result = { ok: false, text: e.message || String(e) };
        t.status = "failed";
      }
      await save();
    }
    messages.push({ role: "assistant", content: reply.content });
    if (handoff) await finish("handoff");

    const results = reply.tools.filter((t) => (t.status === "done" || t.status === "failed") && FEEDBACK.has(t.type));
    const errs = Object.entries(editErrors);
    const hasArtifacts = Boolean(parsed.files.some((x) => x.closed) || parsed.edits.length || parsed.tools.length);
    const next = C.nextStep({ mode: reply.mode, hasArtifacts, narratedIntent: C.narratesWork(parsed.prose), cutOff: reply.cutOff, results: results.length, editErrors: errs.length, step, maxSteps: input.maxSteps || 20, turn });
    if (next.action === "retry-narration") {
      turn.emptyBuildRetries++;
      pushAuto("Asked Fizz Code to apply the work instead of narrating", "Your previous response only described work but did not create a project file or run a tool. Do the work now. For each file, output a complete <fizz-file path=\"relative/path.ext\">...</fizz-file> block. Do not say what you are going to do; output the actual file blocks or tool calls now.");
      continue;
    }
    // Finished (the page runs its checks when it's back) or out of steps: hand back to the page.
    if (next.action === "check" || next.action === "finish") await finish(next.action === "check" ? "done" : "handoff");

    const parts = results.map((t) => `<tool-result tool="${t.type}" request="${first(t.body || t.attrs.path || t.attrs.url || "").replace(/"/g, "&quot;").slice(0, 200)}" ok="${t.status === "done"}">\n${String(t.result?.text || "").slice(0, 12_000)}\n</tool-result>`);
    for (const [path, err] of errs) parts.push(`<tool-result tool="edit" request="${path}" ok="false">\n${err}\n</tool-result>`);
    let tail = "Continue the task from here. Fix anything that failed. If everything works, finish with the updated <fizz-plan> and a short summary, without tool tags.";
    if (next.cut) {
      turn.continues++;
      const open = [...parsed.files, ...parsed.edits].filter((f) => !f.closed).map((f) => f.path);
      parts.unshift(`<tool-result tool="output-limit" ok="false">\nYour last reply hit the output length limit and was cut off${open.length ? ` in the middle of ${open.join(", ")} — that file was NOT saved` : ""}.\n</tool-result>`);
      tail = `Continue exactly where you stopped.${open.length ? ` First write ${open.join(", ")} again completely, from the first line, in a new <fizz-file> block.` : ""} Then carry on with the remaining tasks. Keep each reply to a few files.`;
    }
    pushAuto(next.cut ? "The reply was cut off — continuing" : `Sent ${parts.length} result${parts.length === 1 ? "" : "s"} back to Fizz Code`, `${parts.join("\n\n")}\n\n${tail}`);
    await save();
  }
} catch (e) {
  await finish("error", e.message || String(e));
}
