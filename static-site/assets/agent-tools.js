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

  // The parser lives in the shared agent core (netlify/lib/agent-core.mjs), so the server reads replies the same way.
  const parse = (prose) => F.agentCore.parseTools(prose);

  F.agentTools = { register, registry, parse };
})();
