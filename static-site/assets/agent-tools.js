/* Fizz Code tools. The model asks for tools with tags in its reply, e.g.
     <fizz-run>node test.js</fizz-run>      <fizz-ask question="…" options="A|B"/>
     <fizz-search>query</fizz-search>       <fizz-browser action="open" url="…"/>
   FIZZ DEV parses them, runs them in order, shows each as a step, and (for tools whose results the model
   needs) sends the results back so the agent can keep working. Modules register their tools here. */
(function () {
  "use strict";
  const F = window.FIZZ;

  const registry = {};
  /**
   * def: {
   *   icon, label(tool) → string,        how the step is shown
   *   feedback: true,                     send the result back to the model (agent loop)
   *   needsApproval?(tool, ctx) → bool,   wait for the user's OK before running
   *   run(tool, ctx) → { ok, text, images?: [dataUrl], html?, data? }
   * }
   */
  function register(type, def) { registry[type] = def; }

  const TOOL_RE = /<fizz-([a-z]+)\b((?:\s+[a-zA-Z][\w-]*\s*=\s*"[^"]*")*)\s*(\/>|>([\s\S]*?)(<\/fizz-\1>|$))/g;
  const ATTR_RE = /([a-zA-Z][\w-]*)\s*=\s*"([^"]*)"/g;
  const unescape = (s) => s.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  const KNOWN = new Set(["run", "sandbox", "search", "fetch", "browser", "screenshot", "export", "attach", "ask", "build", "push", "memory"]);

  /** Pulls tool tags out of the prose. Unclosed tags (still streaming) are hidden but not returned. */
  function parse(prose) {
    const tools = [];
    const out = prose.replace(TOOL_RE, (m, type, rawAttrs, end, body, close) => {
      if (!KNOWN.has(type)) return m;
      const attrs = {};
      for (const [, k, v] of rawAttrs.matchAll(ATTR_RE)) attrs[k] = unescape(v);
      const closed = end === "/>" || Boolean(close);
      if (closed) tools.push({ type, attrs, body: (body || "").trim() });
      return "";
    });
    return { prose: out, tools: tools.slice(0, 20) };
  }

  F.agentTools = { register, registry, parse };
})();
