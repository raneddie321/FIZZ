/* FIZZ DEV permissions: one gate every agent action goes through.
   The decision itself (modes, rules, floors) is in the shared agent core (netlify/lib/agent-core.mjs →
   F.agentCore.decidePermission); this file knows what each tool does, keeps the user's and the project's rules,
   and logs every decision for the Activity tab. See docs/roadmap/phase-0.md. */
(function () {
  "use strict";
  const F = window.FIZZ;
  const C = F.agentCore;
  const esc = F.esc;

  const user = () => F.auth.current();
  const data = () => F.loadData(user());
  const settings = () => data().settings;
  const persist = () => F.saveData(user(), data());

  // ---------- mode ----------
  const MODES = [
    ["auto", "Auto", "Fizz runs commands and changes files right away (every change can be undone). Sending, posting, paying and deleting still ask."],
    ["ask", "Ask first", "Fizz asks before commands, connected apps and clicks in the browser; file changes wait for your review."],
    ["plan", "Plan first", "Nothing changes until you approve the plan."],
    ["read-only", "Read-only", "Fizz can read and search, but not change files, run commands or send anything."],
  ];
  function mode() {
    const s = settings();
    // Older versions had one switch, "Ask before running commands".
    if (!C.PERM_MODES.includes(s.permMode)) s.permMode = s.askBeforeRun === true ? "ask" : "auto";
    return s.permMode;
  }
  function setMode(m) {
    if (!C.PERM_MODES.includes(m)) return;
    const s = settings();
    s.permMode = m;
    s.askBeforeRun = m === "ask";
    persist();
    emit();
  }
  /** The agent mode a permission mode pins: plan → Plan, read-only → answers only. */
  const agentMode = () => ({ plan: "plan", "read-only": "ask" })[mode()] || "";

  // ---------- rules ----------
  const userRules = () => C.normalizeRules(settings().permRules);
  function setUserRules(rules) { settings().permRules = C.normalizeRules(rules); persist(); emit(); }
  function addRule(list, rule) {
    const r = userRules();
    if (!C.parseRule(rule) || !r[list]) return false;
    r[list].push(rule);
    setUserRules(r);
    return true;
  }
  const PROJECT_FILE = ".fizz/settings.json";
  /** The project's own rules (.fizz/settings.json → "permissions"). A broken file means no rules, not a crash. */
  function projectRules(project) {
    const raw = project?.files?.[PROJECT_FILE];
    if (typeof raw !== "string" || !raw.trim()) return C.normalizeRules(null);
    try { return C.normalizeRules(JSON.parse(raw).permissions); } catch { return C.normalizeRules(null); }
  }
  const fingerprint = (rules) => { let h = 2166136261; for (const ch of JSON.stringify(rules.allow)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return (h >>> 0).toString(36); };
  /** A project's allow rules count only after the user trusted exactly these rules (a cloned repo can't grant itself anything). */
  const projectTrusted = (project) => { const r = projectRules(project); return r.allow.length > 0 && project?.permTrust === fingerprint(r); };
  function trustProject(project, yes = true) { if (!project) return; if (yes) project.permTrust = fingerprint(projectRules(project)); else delete project.permTrust; persist(); emit(); }

  // ---------- what each tool does ----------
  const first = (s) => String(s || "").split("\n")[0].trim().slice(0, 500);
  const BROWSER_LOOKS = new Set(["open", "newtab", "read", "screenshot", "scroll", "tabs", "switch", "back", "forward", "reload"]);
  const MCP_LOOKS = /(^|[_\-.\s])(get|list|search|read|find|fetch|query|describe|lookup|show|view)(?=$|[_\-.\s])/i;
  const MAP = {
    run: (t) => ({ kind: "run", target: first(t.body) }),
    sandbox: (t) => ({ kind: "run", target: first(t.body) }),
    search: (t) => ({ kind: "network", target: `search ${first(t.body)}`, readOnly: true }),
    fetch: (t) => ({ kind: "network", target: `fetch ${t.attrs.url || first(t.body)}`, readOnly: true }),
    browser: (t) => ({ kind: "browser", target: `${t.attrs.action || ""} ${t.attrs.url || ""}`.trim(), readOnly: BROWSER_LOOKS.has(t.attrs.action) }),
    screenshot: () => ({ kind: "read", target: "preview", readOnly: true }),
    export: (t) => ({ kind: "edit", target: t.attrs.path || t.attrs.name || "export" }),
    build: (t) => ({ kind: "deploy", target: `build ${t.attrs.target || "android"}` }),
    google: (t) => ({ kind: "mcp", target: `google:${t.attrs.app || ""}:${t.attrs.action || ""}` }),
    api: (t) => ({ kind: "mcp", target: `${t.attrs.app || t.attrs.service || "app"}:${t.attrs.method || "GET"} ${t.attrs.path || ""}`.trim(), readOnly: /^(GET|HEAD)?$/i.test(t.attrs.method || "") }),
    mcp: (t) => ({ kind: "mcp", target: `${String(t.attrs.server || "").toLowerCase()}:${t.attrs.tool || t.attrs.action || ""}`, readOnly: ["tools", "list"].includes(t.attrs.action) || MCP_LOOKS.test(t.attrs.tool || "") }),
  };
  /** { kind, target, outbound, softAsk, readOnly } for a tool call, or null when the tool only talks to the user. */
  function describe(t, def, ctx) {
    const base = MAP[t.type]?.(t, ctx);
    const own = def?.perm?.(t, ctx);
    if (!base && !own) return null;
    const d = { outbound: false, softAsk: false, readOnly: false, ...base, ...own };
    // A tool that wants an OK for its own reasons (it sends mail, hands the browser over, starts a build): a hard ask.
    if (!own && !["run", "sandbox"].includes(t.type) && def?.needsApproval?.(t, ctx)) { d.outbound = true; d.readOnly = false; }
    return d;
  }

  // ---------- decisions ----------
  const LOG_MAX = 200;
  const log = [];
  const listeners = new Set();
  const emit = () => listeners.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });
  function record(entry) {
    log.push({ at: Date.now(), ...entry });
    if (log.length > LOG_MAX) log.splice(0, log.length - LOG_MAX);
    emit();
  }
  /** An approved plan builds: plan mode locks only replies that are still planning. */
  const planApproved = (reply) => Boolean(reply && reply.mode !== "plan" && reply.mode !== "ask");
  function decide(kind, target, { outbound = false, softAsk = false, readOnly = false, project = null, reply = null, quiet = false } = {}) {
    const d = C.decidePermission({ mode: mode(), rules: userRules(), project: projectRules(project), projectTrusted: projectTrusted(project), kind, target, outbound, softAsk, readOnly, planApproved: planApproved(reply) });
    if (!quiet && !(d.decision === "allow" && d.why === "default" && (readOnly || kind === "read" || kind === "network"))) record({ kind, target: String(target).slice(0, 200), decision: d.decision, why: d.why, rule: d.rule || "", by: d.why === "rule" ? "rule" : "mode" });
    return d;
  }
  /**
   * The gate for a tool call. → { decision, message, kind, target, rule } (decision "allow" when the tool isn't gated
   * and doesn't ask on its own; "ask" when it asks on its own, as before).
   */
  function forTool(t, def, ctx) {
    const d = describe(t, def, ctx);
    if (!d) return { decision: def?.needsApproval?.(t, ctx) ? "ask" : "allow", message: "", kind: "", target: "" };
    const r = decide(d.kind, d.target, { ...d, project: ctx?.project?.(), reply: ctx?.reply });
    // "Always allow" is offered only where a rule could really allow it next time.
    const always = r.decision === "ask" && !d.outbound && d.kind !== "device" ? (d.kind === "mcp" ? `mcp:${d.target.split(":")[0]}:*` : d.kind === "run" && d.target.length <= 200 ? `run:${d.target}` : "") : "";
    return { ...r, kind: d.kind, target: d.target, always };
  }
  /** The gate for a file the agent wants to write. */
  const forEdit = (path, { project = null, reply = null } = {}) => decide("edit", path, { project, reply });
  /** The user's answer to an "ask" goes in the log too. */
  const answered = (kind, target, allowed) => record({ kind, target: String(target || "").slice(0, 200), decision: allowed ? "allow" : "deny", why: "user", rule: "", by: "you" });

  // ---------- UI pieces ----------
  const label = (m = mode()) => MODES.find((x) => x[0] === m)?.[1] || "Auto";
  const WORD = { allow: "Allowed", ask: "Asked", deny: "Blocked" };
  /** The last decisions, for the Activity tab. */
  function activityHtml(limit = 14) {
    const rows = log.slice(-limit).reverse().map((e) => `<div class="act-row perm-${e.decision}"><span><b>${WORD[e.decision]}</b> · ${esc(e.kind)} <code>${esc(e.target.slice(0, 80))}</code></span><b>${esc(e.by === "you" ? "you" : e.rule ? `rule ${e.rule}` : e.why === "outbound" ? "always asks" : label())}</b></div>`).join("");
    return `<div class="act-row"><span>Mode</span><b>${esc(label())}</b></div>${rows || '<p class="muted-sm">Nothing asked or blocked yet in this session.</p>'}`;
  }
  /** The Permissions part of Settings: the mode, three rule lists, and the open project's own rules. */
  function settingsHtml() {
    return `<fieldset class="perm-set"><legend>Permissions</legend>
      <label class="field"><span>Mode</span><select class="input" name="permMode">${MODES.map(([k, n, d]) => `<option value="${k}">${esc(n)} — ${esc(d)}</option>`).join("")}</select></label>
      <p class="muted-sm">Rules, one per line, written <code>kind:pattern</code> — kinds: run, edit, network, browser, mcp, git-push, deploy, device; <code>*</code> matches anything. “Never allow” wins over “Always ask”, which wins over “Always allow”. Sending, posting, paying and deleting always ask.</p>
      <label class="field"><span>Always allow</span><textarea class="textarea mono" name="permAllow" rows="3" spellcheck="false" placeholder="run:npm test&#10;run:npm run *&#10;mcp:composio:*"></textarea></label>
      <label class="field"><span>Always ask</span><textarea class="textarea mono" name="permAsk" rows="2" spellcheck="false" placeholder="edit:package.json&#10;browser:click *"></textarea></label>
      <label class="field"><span>Never allow</span><textarea class="textarea mono" name="permDeny" rows="3" spellcheck="false" placeholder="run:rm -rf *&#10;edit:.env&#10;git-push:main"></textarea></label>
      <div data-perm-project></div></fieldset>`;
  }
  const lines = (v) => String(v || "").split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 200);
  function fillSettings(form, project) {
    const r = userRules();
    form.permMode.value = mode();
    form.permAllow.value = r.allow.join("\n");
    form.permAsk.value = r.ask.join("\n");
    form.permDeny.value = r.deny.join("\n");
    const box = form.querySelector("[data-perm-project]");
    const pr = projectRules(project);
    const n = pr.allow.length + pr.ask.length + pr.deny.length;
    box.innerHTML = !n ? "" : `<p class="muted-sm"><b>This project has its own rules</b> (${esc(PROJECT_FILE)}): ${pr.deny.length} never, ${pr.ask.length} ask, ${pr.allow.length} allow.${pr.allow.length ? (projectTrusted(project) ? ` Its allow rules are trusted. <button type="button" class="linklike" data-perm-trust="0">Stop trusting</button>` : ` Its allow rules are <b>not used</b> until you trust them: <code>${esc(pr.allow.slice(0, 6).join(", "))}</code> <button type="button" class="linklike" data-perm-trust="1">Trust these rules</button>`) : ""}</p>`;
    box.onclick = (e) => { const b = e.target.closest("[data-perm-trust]"); if (!b) return; trustProject(project, b.dataset.permTrust === "1"); fillSettings(form, project); };
  }
  /** Reads the form back. Returns the lines that aren't rules, so Settings can say so instead of dropping them silently. */
  function readSettings(form) {
    const typed = { allow: lines(form.permAllow.value), ask: lines(form.permAsk.value), deny: lines(form.permDeny.value) };
    const bad = [...typed.allow, ...typed.ask, ...typed.deny].filter((x) => !x.startsWith("#") && !C.parseRule(x));
    settings().permRules = C.normalizeRules(typed);
    setMode(form.permMode.value);
    return bad;
  }

  F.perm = {
    MODES, mode, setMode, label, agentMode,
    rules: userRules, setRules: setUserRules, addRule, projectRules, projectTrusted, trustProject,
    describe, decide, forTool, forEdit, answered,
    log: () => log.slice(), onChange: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    activityHtml, settingsHtml, fillSettings, readSettings,
  };
})();
