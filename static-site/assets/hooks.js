/* FIZZ DEV hooks: commands that run by themselves at fixed points, set per project in .fizz/hooks.json:
     {
       "afterEdit":     [{ "match": "*.{js,css}", "run": "npx prettier --write {file}" }],
       "afterTurn":     [{ "run": "npm test --silent", "timeout": 120 }],
       "beforeCommand": [{ "run": "echo {command} | grep -v deploy" }],
       "beforePush":    [{ "run": "npm run lint" }],
       "beforeDeploy":  [{ "run": "npm run build" }]
     }
   A hook runs in the cloud sandbox ("where": "cloud", the default when there is one) or the project terminal
   ("where": "terminal"). A failing before* hook stops the action; a failing afterEdit/afterTurn hook is sent to Fizz Code
   to fix. Hooks run only once the user trusted exactly this file (a cloned repo or the agent can't add commands that run
   by themselves), and every command still goes through the permission gate. */
(function () {
  "use strict";
  const F = window.FIZZ;
  const FILE = ".fizz/hooks.json";
  const EVENTS = ["afterEdit", "afterTurn", "beforeCommand", "beforePush", "beforeDeploy"];
  const TEMPLATE = `{
  "afterEdit": [],
  "afterTurn": [],
  "beforeCommand": [],
  "beforePush": [],
  "beforeDeploy": []
}
`;
  const EXAMPLES = [
    ["Format changed files", "afterEdit", { match: "*.{js,jsx,ts,tsx,css,html,json,md}", run: "npx --yes prettier --write {file}" }],
    ["Run the tests after each task", "afterTurn", { run: "npm test --silent", timeout: 180 }],
    ["Type-check after each task", "afterTurn", { run: "npx --yes tsc --noEmit", timeout: 180 }],
    ["Lint before pushing to GitHub", "beforePush", { run: "npm run lint --silent" }],
    ["Build before deploying", "beforeDeploy", { run: "npm run build", timeout: 300 }],
  ];

  const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return (h >>> 0).toString(36); };
  const raw = (project) => (typeof project?.files?.[FILE] === "string" ? project.files[FILE] : "");
  /** { hooks: { event: [{ run, match, timeout, where }] }, error, count } */
  function config(project) {
    const text = raw(project);
    const hooks = Object.fromEntries(EVENTS.map((e) => [e, []]));
    if (!text.trim()) return { hooks, error: "", count: 0 };
    let json;
    try { json = JSON.parse(text); } catch (e) { return { hooks, error: `${FILE} isn't valid JSON: ${e.message}`, count: 0 }; }
    let count = 0;
    for (const e of EVENTS) {
      for (const h of Array.isArray(json?.[e]) ? json[e] : []) {
        const run = typeof h === "string" ? h : String(h?.run || "");
        if (!run.trim()) continue;
        hooks[e].push({ run: run.trim().slice(0, 500), match: String(h?.match || ""), timeout: Math.min(600, Math.max(5, Number(h?.timeout) || 120)), where: h?.where === "terminal" ? "terminal" : h?.where === "cloud" ? "cloud" : "auto" });
        count++;
      }
    }
    return { hooks, error: "", count };
  }
  const trusted = (project) => Boolean(raw(project).trim()) && project?.hooksTrust === hash(raw(project));
  function trust(project, yes = true) { if (yes) project.hooksTrust = hash(raw(project)); else delete project.hooksTrust; }

  const quote = (s) => `'${String(s).replace(/'/g, "'\\''")}'`;
  const cloudOk = () => Boolean(F.serverStatusCached?.()?.tools?.sandbox);

  /**
   * Runs the hooks for an event. ctx: { project, term, write, file?, files?, command?, reply? }
   * → { ran: [{ run, ok, code, text, where }], failed: [...], skipped: "" | why, blocked: bool }
   */
  async function run(event, ctx) {
    const project = ctx.project;
    const { hooks, error } = config(project);
    const out = { ran: [], failed: [], skipped: "", blocked: false };
    const list = hooks[event] || [];
    if (error) { out.skipped = error; return out; }
    if (!list.length) return out;
    if (!trusted(project)) { out.skipped = `${FILE} changed and isn't trusted yet, so its hooks didn't run. Open + → Hooks to review and trust it.`; return out; }
    for (const h of list) {
      let targets = [null];
      if (event === "afterEdit") {
        targets = (ctx.files || []).filter((f) => f !== FILE && (!h.match || braceTest(h.match, f)));
        if (!targets.length) continue;
      }
      // {file} runs once per file; {files} once with all of them.
      const perFile = h.run.includes("{file}");
      const batches = event === "afterEdit" ? (perFile ? targets.map((f) => [f]) : [targets]) : [[]];
      for (const batch of batches) {
        const cmd = h.run.replace(/\{file\}/g, batch[0] ? quote(batch[0]) : "").replace(/\{files\}/g, batch.map(quote).join(" ")).replace(/\{command\}/g, quote(ctx.command || ""));
        const perm = F.perm.decide("run", cmd, { project, reply: ctx.reply });
        if (perm.decision === "deny") { const r = { run: cmd, ok: false, code: -1, text: perm.message, where: "-" }; out.ran.push(r); out.failed.push(r); continue; }
        const where = h.where === "auto" ? (cloudOk() ? "cloud" : "terminal") : h.where;
        let r;
        try {
          if (where === "cloud") {
            const res = await withTimeout(F.cloudTools.sandbox(cmd, { project, write: ctx.write }), h.timeout);
            r = { run: cmd, ok: res.exitCode === 0, code: res.exitCode, text: String(res.text || "").trim().slice(-6000), where, changed: res.changed };
          } else {
            const res = await withTimeout(ctx.term().capture(cmd), h.timeout);
            r = { run: cmd, ok: !res.failed, code: res.code, text: String(res.text || "").slice(-6000), where };
          }
        } catch (e) { r = { run: cmd, ok: false, code: 124, text: e.message, where }; }
        out.ran.push(r);
        if (!r.ok) out.failed.push(r);
      }
    }
    out.blocked = event.startsWith("before") && out.failed.length > 0;
    log.push({ at: Date.now(), event, ran: out.ran.length, failed: out.failed.length });
    if (log.length > 100) log.shift();
    return out;
  }
  const withTimeout = (p, sec) => Promise.race([p, new Promise((_, j) => setTimeout(() => j(new Error(`Stopped after ${sec} s (the hook's timeout).`)), sec * 1000))]);
  // "*.{js,css}" → test each alternative (pathGlob has no braces).
  function braceTest(glob, path) {
    const m = /\{([^}]+)\}/.exec(glob);
    if (!m) return F.agentCore.pathGlob(glob)(path);
    return m[1].split(",").some((alt) => braceTest(glob.slice(0, m.index) + alt.trim() + glob.slice(m.index + m[0].length), path));
  }
  /** The results as a tool-result for Fizz Code. */
  function format(event, res) {
    return `<tool-result tool="hook" event="${event}" ok="${!res.failed.length}">\n${res.failed.map((r) => `$ ${r.run}\n${r.text || "(no output)"}\n[exit code ${r.code}]`).join("\n\n")}\n</tool-result>`;
  }
  const log = [];

  F.hooks = { FILE, EVENTS, TEMPLATE, EXAMPLES, config, trusted, trust, run, format, braceTest, log: () => log.slice() };
})();
