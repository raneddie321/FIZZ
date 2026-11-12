// FIZZ agent core: the parts of Fizz Code's agent that don't need a page — reading tool tags out of a reply,
// working out what a message wants, deciding whether an action is allowed, and deciding what the loop does next.
// The browser gets the same code as static-site/assets/agent-core.js (run `node scripts/build-agent-core.mjs`
// after editing); the server will run it for automation. Keep it free of imports, DOM and Node APIs.

// ---------------- tool tags ----------------
export const TOOL_TYPES = ["run", "sandbox", "search", "fetch", "browser", "screenshot", "export", "attach", "ask", "build", "push", "memory", "collect", "google", "remember", "api", "mcp", "tree", "grep", "read", "symbols", "git", "canva", "shopify"];
const TOOL_RE = /<fizz-([a-z]+)\b((?:\s+[a-zA-Z][\w-]*\s*=\s*"[^"]*")*)\s*(\/>|>([\s\S]*?)(<\/fizz-\1>|$))/g;
const ATTR_RE = /([a-zA-Z][\w-]*)\s*=\s*"([^"]*)"/g;
const unescapeAttr = (s) => s.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

/** Pulls tool tags out of the prose. Unclosed tags (still streaming) are hidden but not returned. */
export function parseTools(prose, known = TOOL_TYPES) {
  const types = known instanceof Set ? known : new Set(known);
  const tools = [];
  const out = String(prose ?? "").replace(TOOL_RE, (m, type, rawAttrs, end, body, close) => {
    if (!types.has(type)) return m;
    const attrs = {};
    for (const [, k, v] of rawAttrs.matchAll(ATTR_RE)) attrs[k] = unescapeAttr(v);
    const closed = end === "/>" || Boolean(close);
    if (closed) tools.push({ type, attrs, body: (body || "").trim() });
    return "";
  });
  return { prose: out, tools: tools.slice(0, 20) };
}

// ---------------- what a message wants ----------------
/** build | plan | ask | do — what the message wants, in English and Hebrew. */
export function detectMode(text, { hasFiles = false } = {}) {
  const t = String(text || "").trim().toLowerCase();
  if (!t) return "build";
  if (/^(plan|make a plan|just plan)\b|^(תכנן|תתכנן|תכין תוכנית|תעשה תוכנית)/.test(t)) return "plan";
  const build = /\b(build|make|create|add|fix|change|update|implement|write|refactor|redesign|design|generate|convert|rename|remove|delete|style|improve|translate|deploy)\b|(^|\s)(תבנה|תבני|בנה|תעשה|תעשי|תיצור|צור|תוסיף|תוסיפי|תתקן|תקן|תשנה|תעדכן|תכתוב|תעצב|תמחק|תסדר|תשפר|תהפוך|תמיר|תתרגם)(\s|$)/.test(t);
  const doTask = /\b(sign (me )?up|register|log ?in|send (an? |the )?(email|message)|reply to|upload|post (it|this|to)|book|order|buy|schedule|go to|open (the )?(site|website|page)|get me (an? )?(api )?key|in my (gmail|calendar|drive|notion|inbox))\b|(תירשם|תרשום אותי|תרשמי|תשלח|תעלה ל|תפרסם|תזמין|תקבע|תיכנס ל|תכנס ל|תביא לי|במייל שלי|ביומן שלי|בדרייב|בנושן|בג'ימייל)/.test(t);
  const question = /\?\s*$/.test(t) || /^(what|why|how|when|where|which|who|whose|is|are|was|can you (tell|explain)|could you explain|does|do i|did|explain|tell me|should|would|am i)\b/.test(t)
    || /^(מה|למה|מדוע|איך|כיצד|מתי|איפה|היכן|איזה|איזו|אילו|מי|האם|תסביר|תגיד לי|תגיד|כמה|יש לי|אני מחובר|תבדוק מה|תבדוק למה|תבדוק אם|בדוק מה|בדוק למה|תראה לי מה|מה זה)/.test(t);
  const askToBuild = /^(can|could|would) you (please )?(build|make|create|add|fix|change|write|design)\b|^(תוכל|תוכלי|אתה יכול|את יכולה) (לבנות|ליצור|להוסיף|לתקן|לשנות|לכתוב)/.test(t);
  if (doTask) return "do";
  if (question && !askToBuild) return "ask";
  if (build) return "build";
  // A statement with no clear verb: a project to work on gets the build agent, otherwise just answer.
  return hasFiles || /אתר|אפליקציה|משחק|website|app|game|page/.test(t) ? "build" : "ask";
}

/** A rough token count (no tokenizer in the browser): good enough to know when a chat needs compacting. */
export const estimateTokens = (text) => Math.ceil(String(text || "").length / 3.6);

// ---------------- permissions ----------------
export const PERM_KINDS = ["read", "edit", "run", "network", "browser", "git-push", "deploy", "mcp", "outbound", "device"];
export const PERM_MODES = ["auto", "ask", "plan", "read-only"];
/** Kinds that change something outside the conversation. */
const CHANGES = new Set(["edit", "run", "git-push", "deploy", "mcp", "outbound", "device"]);
const squash = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

/** "run:npm run *" → { kind: "run", pattern: "npm run *" }; a bare kind means everything of that kind. */
export function parseRule(rule) {
  const s = squash(rule);
  if (!s || s.startsWith("#")) return null;
  const i = s.indexOf(":");
  const kind = (i < 0 ? s : s.slice(0, i)).trim().toLowerCase();
  if (!PERM_KINDS.includes(kind)) return null;
  const pattern = i < 0 ? "*" : s.slice(i + 1).trim() || "*";
  return { kind, pattern, text: `${kind}:${pattern}` };
}
/** { allow, ask, deny } with only well-formed rules, without duplicates. */
export function normalizeRules(rules) {
  const out = { allow: [], ask: [], deny: [] };
  for (const list of Object.keys(out)) {
    const seen = new Set();
    for (const raw of Array.isArray(rules?.[list]) ? rules[list] : []) {
      const r = parseRule(raw);
      if (r && !seen.has(r.text)) { seen.add(r.text); out[list].push(r.text); }
    }
  }
  return out;
}
const globRe = (glob) => new RegExp(`^${squash(glob).replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*+/g, ".*").replace(/\?/g, ".")}$`);
const wildcardOnly = (pattern) => /^[*?\s]*$/.test(pattern);

/**
 * The parts of a command line that run on their own: "a && b; c | d" → [a, b, c, d], plus what's inside $(…) and
 * backticks. Leading VAR=value, sudo, env, nohup, time and command are dropped so a rule sees the real command.
 */
export function splitCommand(cmd) {
  const s = String(cmd ?? "");
  const parts = [];
  let cur = "", quote = "", subst = 0;
  const push = () => { parts.push(cur); cur = ""; };
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) { cur += c; if (c === quote && s[i - 1] !== "\\") quote = ""; continue; }
    if (c === '"' || c === "'") { quote = c; cur += c; continue; }
    // $( … ) stays with its command (its inside is added below); bare ( … ) is a subshell.
    if (c === "$" && s[i + 1] === "(") { subst++; cur += "$("; i++; continue; }
    if (c === ")" && subst) { subst--; cur += c; continue; }
    if (c === "\n" || c === ";" || c === "(" || c === ")") { push(); continue; }
    if (c === "&" || c === "|") { if (s[i + 1] === c) i++; push(); continue; }
    cur += c;
  }
  push();
  for (const m of s.matchAll(/\$\(([^()]*)\)|`([^`]*)`/g)) parts.push(m[1] ?? m[2]);
  const strip = (p) => {
    let t = squash(p);
    for (let n = 0; n < 6; n++) {
      const next = t.replace(/^(?:[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|\S*)\s+|(?:sudo|env|nohup|time|command|exec)\s+(?:-\S+\s+)*)/, "");
      if (next === t) break;
      t = next;
    }
    return t;
  };
  return [...new Set(parts.map(strip).filter(Boolean))];
}

/** Commands that only look: they run in read-only and plan mode. Anything that writes a file (>) doesn't count. */
const READ_ONLY_CMD = /^(?:ls|ll|cat|head|tail|wc|grep|rg|find|pwd|echo|printf|diff|stat|file|du|df|which|whoami|date|printenv|tree|sort|uniq|cut|jq|basename|dirname|realpath|true|test|git (?:status|log|diff|show|branch|remote|rev-parse|ls-files|blame|describe)|npm (?:ls|list|view|outdated|-v|--version)|node (?:-v|--version)|python3? (?:-V|--version))(?=\s|$)/;
export const readOnlyCommand = (cmd) => {
  const parts = splitCommand(cmd);
  return parts.length > 0 && parts.every((p) => READ_ONLY_CMD.test(p) && !/[>]|\s-(?:delete|exec|execdir|ok|i)\b|\s--in-place\b|\s-o\s/.test(p));
};

/** Does one rule cover this action? Paths also match by file name when the pattern has no slash. */
export function ruleMatches(rule, kind, target) {
  const r = typeof rule === "string" ? parseRule(rule) : rule;
  if (!r || r.kind !== kind) return false;
  const re = globRe(r.pattern);
  const t = squash(target);
  if (re.test(t)) return true;
  if ((kind === "edit" || kind === "read") && !r.pattern.includes("/")) return re.test(t.split("/").pop());
  return false;
}
const firstMatch = (rules, kind, targets, every = false) => {
  for (const rule of rules) {
    const hit = every ? targets.every((t) => ruleMatches(rule, kind, t)) : targets.some((t) => ruleMatches(rule, kind, t));
    if (hit) return rule;
  }
  if (!every || targets.length < 2) return null;
  // A compound command is allowed when every part is covered by some allow rule.
  return targets.every((t) => rules.some((rule) => ruleMatches(rule, kind, t))) ? rules.find((rule) => targets.some((t) => ruleMatches(rule, kind, t))) : null;
};

const MODE_NOTE = {
  "read-only": "Read-only mode is on: Fizz can read and search, but not change files, run commands or send anything.",
  plan: "Plan mode is on: nothing changes until you approve the plan.",
};

/**
 * May the agent do this?  → { decision: "allow" | "ask" | "deny", why, rule?, message }
 *   mode          "auto" | "ask" | "plan" | "read-only"
 *   rules         the user's { allow, ask, deny }
 *   project       the project's rules; its allow list only counts when projectTrusted
 *   kind, target  what is being done, e.g. "run" + the command, "edit" + the path, "mcp" + "server:tool"
 *   outbound      it sends, posts, pays or deletes somewhere: always asks
 *   softAsk       the tool would like to ask (e.g. the first call to a server); an allow rule can skip it
 *   readOnly      the action only looks (a browser "read", a search)
 *   planApproved  plan mode, and the user approved the plan this turn
 */
export function decidePermission({ mode = "auto", rules, project, projectTrusted = false, kind, target = "", outbound = false, softAsk = false, readOnly = false, planApproved = false } = {}) {
  const user = normalizeRules(rules), proj = normalizeRules(project);
  const targets = kind === "run" ? splitCommand(target) : [squash(target)];
  if (!targets.length) targets.push("");
  const m = PERM_MODES.includes(mode) ? mode : "auto";

  const denied = firstMatch([...user.deny, ...proj.deny], kind, targets) || (outbound ? firstMatch([...user.deny, ...proj.deny], "outbound", targets) : null);
  if (denied) return { decision: "deny", why: "rule", rule: denied, message: `Blocked by the permission rule “deny ${denied}”.` };

  const locked = m === "read-only" || (m === "plan" && !planApproved);
  if (locked) {
    const looks = !outbound && (readOnly || kind === "read" || kind === "network" || (kind === "run" && readOnlyCommand(target)));
    if (!looks && (CHANGES.has(kind) || kind === "browser" || outbound)) return { decision: "deny", why: "mode", message: MODE_NOTE[m] };
  }
  if (outbound) return { decision: "ask", why: "outbound", message: "This sends, posts, pays or deletes something, so Fizz always asks first." };

  const asks = firstMatch([...user.ask, ...proj.ask], kind, targets);
  if (asks) return { decision: "ask", why: "rule", rule: asks, message: `The rule “ask ${asks}” says to ask first.` };

  const usable = (list) => (kind === "device" ? list.filter((r) => !wildcardOnly(parseRule(r).pattern)) : list);
  const allowed = firstMatch(usable([...user.allow, ...(projectTrusted ? proj.allow : [])]), kind, targets, true);
  if (allowed) return { decision: "allow", why: "rule", rule: allowed, message: `Allowed by the rule “allow ${allowed}”.` };

  if (kind === "device") return { decision: "ask", why: "device", message: "Controlling a device always asks unless a specific rule allows it." };
  if (softAsk) return { decision: "ask", why: "first-use", message: "First use: Fizz asks once." };
  if (m === "ask" && !readOnly && (CHANGES.has(kind) || kind === "browser") && !(kind === "run" && readOnlyCommand(target))) {
    return { decision: "ask", why: "mode", message: "Ask mode is on: Fizz asks before it changes or runs anything." };
  }
  return { decision: "allow", why: "default", message: "" };
}

// ---------------- the loop ----------------
/** The model said it would do the work instead of doing it ("I'll create index.html…"). */
export const narratesWork = (prose) => /\b(?:i(?:'| a)m going to|i(?:'| a)ll|now i|let me|i will|creating|writing|going to create|going to write)\b/i.test(prose || "")
  && /\b(?:file|index\.html|\.css|\.js|component|implement|create|write|run|execute)\b/i.test(prose || "");

/**
 * After a reply's tools ran, what the loop does next:
 *   finish (why: question | approval | stopped | limit) · retry-narration · check (run the checks, then finish) · continue
 * `narrationFailed` says the model narrated twice without doing the work; `cut` that the reply hit its length limit.
 */
export function nextStep({ asked = false, waiting = false, stopped = false, mode = "build", hasArtifacts = false, narratedIntent = false, cutOff = false, results = 0, editErrors = 0, step = 1, maxSteps = 20, maxContinues = 4, turn = {} } = {}) {
  if (asked || waiting || stopped) return { action: "finish", why: asked ? "question" : waiting ? "approval" : "stopped", cut: false, narrationFailed: false };
  const retries = Number(turn.emptyBuildRetries) || 0, continues = Number(turn.continues) || 0;
  const narrating = mode === "build" && !hasArtifacts && narratedIntent;
  if (narrating && retries < 1 && step < maxSteps) return { action: "retry-narration", cut: false, narrationFailed: false };
  const narrationFailed = narrating && retries >= 1;
  const cut = Boolean(cutOff && mode === "build");
  if (cut && (continues >= maxContinues || step >= maxSteps)) return { action: "finish", why: "limit", cut, narrationFailed };
  if (!cut && !results && !editErrors) return { action: "check", cut, narrationFailed };
  if (step >= maxSteps) return { action: "finish", why: "limit", cut, narrationFailed };
  return { action: "continue", cut, narrationFailed };
}

// ---------------- long conversations ----------------
const CONTEXT_SIZES = [
  [/gemini/, 1_000_000],
  [/claude/, 200_000],
  [/glm-(?:4\.[6-9]|[5-9])/, 200_000],
  [/deepseek/, 64_000],
  [/gemma|mixtral|llama-?3-8b|llama3-8b/, 8_000],
];
/**
 * How many tokens the model can take in. An explicit setting wins; then a size written in the model's name
 * ("-32768", "-128k"); then what's known about the family; otherwise 128k. Guessing low only compacts earlier;
 * guessing high is caught by the "too long" retry.
 */
export function contextSize(model, override) {
  const set = Number(override);
  if (set >= 2000) return Math.round(set);
  const m = String(model || "").toLowerCase();
  const exact = /(?:^|[-_/:.])(8192|16384|32768|65536|131072|262144)(?=$|[-_/:.])/.exec(m);
  if (exact) return Number(exact[1]);
  const k = /(?:^|[-_/:.])(\d{1,4})k(?=$|[-_/:.])/.exec(m);
  if (k && +k[1] >= 4 && +k[1] <= 2000) return +k[1] * 1000;
  for (const [re, n] of CONTEXT_SIZES) if (re.test(m)) return n;
  return 128_000;
}

/** The provider said the conversation doesn't fit the model (or the request is too large for it). */
export function isContextOverflow(err) {
  const status = Number(err?.status) || 0;
  if (status && ![400, 413, 422, 500].includes(status)) return false;
  return /context[\s_-]?(?:length|window|size|limit)|maximum context|context_length_exceeded|too many (?:input )?tokens|token limit|tokens? (?:limit )?exceed|exceeds? (?:the )?(?:maximum|max|model|context)|prompt is too long|input is too long|request too large|reduce the (?:length|size)|too long for (?:this|the) model/i.test(String(err?.message || err || ""));
}

const tokensOf = (m) => estimateTokens(m?.content) + (m?.attachments || []).reduce((n, a) => n + (a.type === "image" ? 1500 : estimateTokens(a.text)), 0);
/** Tokens in a list of chat messages (text, plus a flat cost per image). */
export const messagesTokens = (messages) => (messages || []).reduce((n, m) => n + tokensOf(m), 0);

/**
 * Which messages to summarise and which to keep as they are: at least the last `keep`, starting at an assistant
 * message — the summary takes the place of a user message, so roles still alternate, and a reply stays with the
 * tool results that follow it. null when there is nothing worth summarising.
 */
export function compactPlan(messages, keep = 6) {
  const n = messages?.length || 0;
  if (n < keep + 2) return null;
  let cut = n - keep;
  while (cut > 0 && messages[cut].role !== "assistant") cut--;
  if (cut < 2) { cut = n - keep; while (cut < n - 1 && messages[cut].role !== "assistant") cut++; }
  if (cut < 2 || cut >= n - 1) return null;
  return { older: messages.slice(0, cut), kept: messages.slice(cut), olderTokens: messagesTokens(messages.slice(0, cut)) };
}

/** What the summariser is told: fixed sections, so the next context finds things where it expects them. */
export const SUMMARY_SYSTEM = [
  "You summarise a coding session so the work can continue in a fresh context. Write these sections in this order, at most 450 words in total, as plain text:",
  "GOAL — what the user wants built, in one or two sentences.",
  "DECISIONS — choices and preferences the user stated (design, tech, wording, things to avoid).",
  "FILES — each file that was created or changed, with one line on what it does now.",
  "OPEN — bugs, errors and unfinished parts, with the exact error text when it is known.",
  "NEXT — the next steps, in order.",
  "Keep names, paths, URLs, numbers and the user's own wording exact. Leave out a section's content only if there is none (write “none”). Don't add advice or greetings. Write in the language the user writes in.",
].join("\n");

/** The older messages as a transcript for the summariser, within a size the model can read. */
export function summaryTranscript(messages, { proseOf = (m) => m.content, maxChars = 120_000, files = [] } = {}) {
  const who = (m) => (m.summary ? "EARLIER SUMMARY" : m.role === "user" ? (m.auto ? "TOOL RESULTS" : "USER") : "FIZZ CODE");
  const body = (messages || []).map((m) => `${who(m)}: ${String(proseOf(m) || m.content || "")}`.slice(0, 6000)).join("\n\n");
  const list = files.length ? `\n\nFILES CHANGED IN THESE MESSAGES: ${[...new Set(files)].slice(0, 80).join(", ")}` : "";
  // The start (the goal) and the end (where things stand) matter most.
  const room = Math.max(4000, maxChars - list.length);
  const text = body.length <= room ? body : `${body.slice(0, Math.round(room * 0.35))}\n\n[… middle left out …]\n\n${body.slice(-Math.round(room * 0.6))}`;
  return text + list;
}

/**
 * Last resort when the chat still doesn't fit and can't be summarised: shorten long messages (keeping their start
 * and end), and if that changes nothing, keep only the last few with a note. → { messages, changed }
 */
export function shrinkMessages(messages, { max = 4000, keepLast = 2, note = "Earlier messages were left out to fit this model's context." } = {}) {
  const list = messages || [];
  let changed = false;
  const out = list.map((m, i) => {
    const text = String(m.content || "");
    if (i >= list.length - keepLast || text.length <= max) return m;
    changed = true;
    return { ...m, content: `${text.slice(0, Math.round(max * 0.6))}\n\n[… shortened to fit the model's context …]\n\n${text.slice(-Math.round(max * 0.25))}` };
  });
  if (changed) return { messages: out, changed };
  if (list.length <= 4) return { messages: list, changed: false }; // too short to drop anything
  let cut = list.length - 4;
  while (cut < list.length - 1 && list[cut].role !== "assistant") cut++;
  return { messages: [{ role: "user", summary: true, content: note }, ...list.slice(cut)], changed: true };
}

// ---------------- looking around a project ----------------
/** Above this a project gets an index in the prompt instead of every file. */
export const BIG_PROJECT = { files: 80, chars: 120_000 };
export const isBigProject = ({ files = 0, chars = 0 } = {}) => files > BIG_PROJECT.files || chars > BIG_PROJECT.chars;
const human = (n) => (n < 1000 ? `${n} B` : n < 1_000_000 ? `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)} kB` : `${(n / 1_000_000).toFixed(1)} MB`);
const cleanPath = (p) => String(p || "").replace(/^\.?\/+/, "").replace(/\/+$/, "").replace(/^\.$/, "");

/**
 * The files as an indented tree with sizes. entries: [{ path, size }]. Folders deeper than `depth` are folded to
 * "name/ (N files, size)"; the listing stops at `max` lines and says how to see the rest.
 */
export function treeText(entries, { path = "", depth = 3, max = 400 } = {}) {
  const base = cleanPath(path);
  const under = (entries || []).filter((e) => !base || e.path === base || e.path.startsWith(`${base}/`));
  if (!under.length) return base ? `Nothing at ${base}.` : "The project has no files.";
  const root = { dirs: new Map(), files: [], count: 0, size: 0 };
  for (const e of under) {
    const rel = base ? e.path.slice(base.length + 1) : e.path;
    if (!rel) { root.files.push({ name: e.path.split("/").pop(), size: e.size || 0 }); root.count++; root.size += e.size || 0; continue; }
    const parts = rel.split("/");
    let node = root;
    node.count++; node.size += e.size || 0;
    for (const dir of parts.slice(0, -1)) {
      if (!node.dirs.has(dir)) node.dirs.set(dir, { dirs: new Map(), files: [], count: 0, size: 0 });
      node = node.dirs.get(dir);
      node.count++; node.size += e.size || 0;
    }
    node.files.push({ name: parts.at(-1), size: e.size || 0 });
  }
  const lines = [];
  let cut = false;
  const walk = (node, level) => {
    const pad = "  ".repeat(level);
    for (const [name, dir] of [...node.dirs].sort((a, b) => a[0].localeCompare(b[0]))) {
      if (lines.length >= max) { cut = true; return; }
      if (level + 1 >= depth) { lines.push(`${pad}${name}/ (${dir.count} file${dir.count === 1 ? "" : "s"}, ${human(dir.size)})`); continue; }
      lines.push(`${pad}${name}/`);
      walk(dir, level + 1);
    }
    for (const f of node.files.sort((a, b) => a.name.localeCompare(b.name))) {
      if (lines.length >= max) { cut = true; return; }
      lines.push(`${pad}${f.name}  ${human(f.size)}`);
    }
  };
  walk(root, 0);
  const head = `${base || "."}/ — ${root.count} file${root.count === 1 ? "" : "s"}, ${human(root.size)}`;
  return `${head}\n${lines.join("\n")}${cut ? `\n… more not shown: ask for a folder (path="…") or a smaller depth.` : ""}`;
}

/** Lines of a text with their numbers. range: "120-260", "120" (from there) or empty (from the top). */
export function readLines(text, range = "", { maxLines = 400, maxChars = 30_000 } = {}) {
  const all = String(text ?? "").split("\n");
  const m = /^\s*(\d+)?\s*(?:-\s*(\d+)?)?\s*$/.exec(String(range || ""));
  let from = Math.max(1, Number(m?.[1]) || 1);
  let to = Number(m?.[2]) || (m?.[1] && !String(range).includes("-") ? from + maxLines - 1 : all.length);
  from = Math.min(from, Math.max(1, all.length));
  to = Math.min(Math.max(to, from), all.length, from + maxLines - 1);
  const width = String(to).length;
  let out = "", last = from - 1;
  for (let i = from; i <= to; i++) {
    const line = `${String(i).padStart(width)}  ${all[i - 1]}\n`;
    if (out.length + line.length > maxChars) break;
    out += line; last = i;
  }
  return { text: out.replace(/\n$/, ""), from, to: last, total: all.length, more: last < all.length };
}

/** "*.js", "src/**" + "/*.ts", "docs/" → a test for a path. A pattern without a slash is matched against the file name. */
export function pathGlob(glob) {
  const g = String(glob || "").trim();
  if (!g) return () => true;
  const body = g.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*\/?/g, "\u0000").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]").replace(/\u0000/g, ".*");
  const re = new RegExp(`^${body}${g.endsWith("/") ? ".*" : ""}$`);
  return g.includes("/") ? (p) => re.test(p) : (p) => re.test(p.split("/").pop());
}

/**
 * Search the project's text. files: { path: text }. → { matches: [{ path, line, text }], files, truncated, literal }
 * A pattern that isn't a valid regular expression is searched as plain text.
 */
export function grepFiles(files, { pattern = "", path = "", glob = "", ignoreCase = false, max = 80, skip = () => false } = {}) {
  let re, literal = false;
  try { re = new RegExp(pattern, ignoreCase ? "i" : ""); } catch { literal = true; re = new RegExp(String(pattern).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), ignoreCase ? "i" : ""); }
  const base = cleanPath(path), inGlob = pathGlob(glob);
  const whole = new RegExp(re.source, `${re.flags}m`); // ^ and $ mean a line's start and end there, as they do per line below
  const matches = [], hit = new Set();
  let truncated = false;
  for (const [p, text] of Object.entries(files || {})) {
    if (typeof text !== "string" || (base && p !== base && !p.startsWith(`${base}/`)) || !inGlob(p) || skip(p, text)) continue;
    if (!pattern || !whole.test(text)) continue; // one pass over the whole file before splitting it
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (!re.test(lines[i])) continue;
      if (matches.length >= max) { truncated = true; break; }
      matches.push({ path: p, line: i + 1, text: lines[i].trim().slice(0, 240) });
      hit.add(p);
    }
    if (truncated) break;
  }
  return { matches, files: hit.size, truncated, literal };
}

const SYMBOLS = [
  [/\.(m?[jt]sx?|cjs)$/i, [/^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\*?\s+([A-Za-z_$][\w$]*)/, /^\s*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/, /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/, /^\s*(?:export\s+)?(?:interface|type|enum)\s+([A-Za-z_$][\w$]*)/, /^\s*export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/]],
  [/\.py$/i, [/^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)/, /^\s*class\s+([A-Za-z_]\w*)/]],
  [/\.(go)$/i, [/^func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)/, /^type\s+([A-Za-z_]\w*)/]],
  [/\.(rs)$/i, [/^\s*(?:pub\s+)?(?:async\s+)?fn\s+([A-Za-z_]\w*)/, /^\s*(?:pub\s+)?(?:struct|enum|trait|impl)\s+([A-Za-z_]\w*)/]],
  [/\.(java|kt|cs|swift|php)$/i, [/^\s*(?:public|private|protected|internal|static|final|abstract|open|override|\s)*(?:class|interface|enum|struct|fun|func|function)\s+([A-Za-z_]\w*)/]],
  [/\.(css|scss|less)$/i, [/^([^\s@/{}][^{}]*?)\s*\{/, /^(@(?:media|keyframes|font-face|supports)[^{]*)\{/]],
  [/\.(html?|vue|svelte)$/i, [/<(?:[a-z][\w-]*)\b[^>]*\bid="([^"]+)"/i, /<(h[1-3])\b/i, /<(script|style|template)\b/i]],
  [/\.(md|mdx)$/i, [/^(#{1,4}\s+.+)$/]],
];
/** A quick outline of a source file — functions, classes, exports, selectors, headings — with line numbers. */
export function symbolsOf(text, path = "", { max = 200 } = {}) {
  const rules = SYMBOLS.find(([ext]) => ext.test(path))?.[1] || SYMBOLS[0][1];
  const out = [];
  const lines = String(text ?? "").split("\n");
  for (let i = 0; i < lines.length && out.length < max; i++) {
    if (lines[i].length > 400) continue; // minified
    for (const re of rules) { const m = re.exec(lines[i]); if (m) { out.push({ line: i + 1, name: m[1].trim().slice(0, 80), text: lines[i].trim().slice(0, 120) }); break; } }
  }
  return out;
}

/** .gitignore lines → a test for a path ("node_modules/", "*.log", "/dist", "!keep.txt"). */
export function ignoreMatcher(text) {
  const rules = String(text || "").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#")).map((l) => {
    const neg = l.startsWith("!");
    let g = neg ? l.slice(1) : l;
    const dirOnly = g.endsWith("/");
    g = g.replace(/\/+$/, "");
    const anchored = g.startsWith("/") || g.includes("/");
    g = g.replace(/^\/+/, "");
    const body = g.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*\/?/g, "\u0000").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]").replace(/\u0000/g, ".*");
    return { neg, dirOnly, re: new RegExp(anchored ? `^${body}(?:/|$)` : `(?:^|/)${body}(?:/|$)`) };
  });
  /** isDir: the path is a folder. */
  return (p, isDir = false) => {
    let ignored = false;
    for (const r of rules) {
      if (!r.re.test(p)) continue;
      // A folder-only rule matches a file only when the match is one of its parent folders.
      if (r.dirOnly && !isDir && r.re.exec(p)[0].replace(/\/$/, "").length === p.length) continue;
      ignored = !r.neg;
    }
    return ignored;
  };
}
