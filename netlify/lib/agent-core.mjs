// FIZZ agent core: the parts of Fizz Code's agent that don't need a page — reading tool tags out of a reply,
// working out what a message wants, deciding whether an action is allowed, and deciding what the loop does next.
// The browser gets the same code as static-site/assets/agent-core.js (run `node scripts/build-agent-core.mjs`
// after editing); the server will run it for automation. Keep it free of imports, DOM and Node APIs.

// ---------------- tool tags ----------------
export const TOOL_TYPES = ["run", "sandbox", "search", "fetch", "browser", "screenshot", "export", "attach", "ask", "build", "push", "memory", "collect", "google", "remember", "api", "mcp"];
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
