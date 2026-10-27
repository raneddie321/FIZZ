/* Shared Settings dialog for FIZZ and FIZZ DEV: General, AI, Connections, Tools, Account. */
(function () {
  "use strict";
  const F = window.FIZZ;
  const { esc } = F;

  const CONN = [
    { id: "github", name: "GitHub", desc: "Import repositories and push your projects as commits.", icon: '<svg viewBox="0 0 24 24" class="i" aria-hidden="true"><path fill="currentColor" stroke="none" d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.46-1.16-1.11-1.47-1.11-1.47-.9-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.89 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02a9.6 9.6 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2z"/></svg>' },
    { id: "vercel", name: "Vercel", desc: "Deploy projects and get a live URL.", icon: '<svg viewBox="0 0 24 24" class="i" aria-hidden="true"><path fill="currentColor" stroke="none" d="M12 3l10 18H2z"/></svg>' },
    { id: "google", name: "Google Workspace", desc: "Gmail, Calendar, Docs, Sheets, Slides, Drive, Tasks and Contacts — Fizz Code can use them for you.", icon: '<svg viewBox="0 0 24 24" class="i" aria-hidden="true"><path d="M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6"/></svg>' },
  ];

  function ensureDialog() {
    let d = document.getElementById("fizz-settings");
    if (d) return d;
    d = document.createElement("dialog");
    d.id = "fizz-settings";
    d.className = "dlg settings-dlg";
    d.innerHTML = `<form method="dialog" class="dlg-body">
      <h2>Settings</h2>
      <div class="dlg-tabs" role="tablist">
        <button type="button" data-tab="general">General</button><button type="button" data-tab="ai">AI</button>
        <button type="button" data-tab="connections">Connections</button><button type="button" data-tab="tools">Tools</button><button type="button" data-tab="account">Account</button>
      </div>
      <div data-pane="general" class="form">
        <label class="field"><span>Name</span><input class="input" name="name" maxlength="80" /></label>
        <label class="field"><span>Theme</span><select class="select" name="theme"><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
        <label class="field"><span>Response style</span><select class="select" name="style"><option value="balanced">Balanced</option><option value="concise">Concise</option><option value="detailed">Detailed</option></select></label>
        <label class="field"><span>Custom instructions</span><textarea class="textarea" name="instructions" maxlength="2000" rows="3" placeholder="Anything FIZZ should know about you or how to respond"></textarea></label>
        <label class="field"><span>What Fizz remembers about you</span><textarea class="textarea" name="memory" maxlength="12000" rows="4" placeholder="One fact per line. Fizz adds things here when you tell it to remember them; edit or delete freely."></textarea><small class="muted-sm">Kept in this browser. Never put passwords or card numbers here.</small></label>
      </div>
      <div data-pane="ai" class="form">
        <div class="provider-list" role="radiogroup" aria-label="AI provider">
          <label class="provider"><input type="radio" name="provider" value="fizz" /><span><b>FIZZ AI</b><small data-ai-status>Checking…</small></span></label>
          <label class="provider"><input type="radio" name="provider" value="openrouter" /><span><b>Your OpenRouter account</b><small>Hundreds of models (GLM, Qwen, DeepSeek, Llama, Claude, GPT…). Usage is billed to your OpenRouter account; free models available.</small></span></label>
          <label class="provider"><input type="radio" name="provider" value="gemini" /><span><b>Your Google AI Studio key</b><small>Gemini models with your own key from aistudio.google.com — there's a free tier.</small></span></label>
          <label class="provider"><input type="radio" name="provider" value="anthropic" /><span><b>Your Anthropic API key</b><small>Use Claude models directly with your own key.</small></span></label>
          <label class="provider"><input type="radio" name="provider" value="groq" /><span><b>Groq</b><small>Fast inference for supported open models.</small></span></label>
          <label class="provider"><input type="radio" name="provider" value="zai" /><span><b>Z.AI (GLM)</b><small>Connect your GLM API key.</small></span></label>
          <label class="provider"><input type="radio" name="provider" value="requesty" /><span><b>Requesty AI</b><small>One API key for models across many providers.</small></span></label>
          <label class="provider"><input type="radio" name="provider" value="deepseek" /><span><b>DeepSeek</b><small>Use DeepSeek models directly.</small></span></label>
          <label class="provider"><input type="radio" name="provider" value="cerebras" /><span><b>Cerebras</b><small>Fast inference on supported models.</small></span></label>
          <label class="provider"><input type="radio" name="provider" value="together" /><span><b>Together AI</b><small>Hosted open-source models.</small></span></label>
          <label class="provider"><input type="radio" name="provider" value="custom-openai" /><span><b>Other OpenAI-compatible provider</b><small>Add a custom API key, base URL and model ID.</small></span></label>
        </div>
        <div data-sub="openrouter" class="form">
          <div class="row-inline"><button type="button" class="btn btn-sm" data-or-connect>Connect OpenRouter</button><span class="muted-sm" data-or-state></span></div>
          <label class="field"><span>Or paste an OpenRouter key</span><input class="input" name="openrouterKey" type="password" autocomplete="off" placeholder="sk-or-…" /></label>
          <label class="field"><span>Model</span><input class="input mono" name="openrouterModel" list="or-models" placeholder="z-ai/glm-4.6" /><datalist id="or-models"></datalist>
            <small>Any model ID from openrouter.ai/models. <button type="button" class="link" data-or-models>Load model list</button></small></label>
        </div>
        <div data-sub="gemini" class="form">
          <label class="field"><span>Google AI Studio API key</span><input class="input" name="geminiKey" type="password" autocomplete="off" placeholder="AIza…" /><small>Get one at aistudio.google.com → Get API key. Stored only in this browser and sent only to Google.</small></label>
          <label class="field"><span>Model</span><input class="input mono" name="geminiModel" list="gemini-models" placeholder="gemini-3.8-flash" /><datalist id="gemini-models"></datalist>
            <small><button type="button" class="link" data-gemini-models>Load my models</button> <span data-gemini-state class="muted-sm"></span></small></label>
        </div>
        <div data-sub="anthropic" class="form">
          <label class="field"><span>Anthropic API key</span><input class="input" name="apiKey" type="password" autocomplete="off" placeholder="sk-ant-…" /><small>Stored only in this browser and sent only to api.anthropic.com.</small></label>
          <label class="field"><span>Model</span><select class="select" name="model"></select></label>
        </div>
        <div data-sub="groq" class="form">
          <label class="field"><span>Groq API key</span><input class="input" name="groqKey" type="password" autocomplete="off" placeholder="gsk_…" /><small>Saved in this browser only. FIZZ sends it to Groq when you use this provider.</small></label>
          <label class="field"><span>Model ID</span><input class="input mono" name="groqModel" placeholder="llama-3.3-70b-versatile" /><small>Use a model ID available in your Groq account.</small></label>
        </div>
        <div data-sub="zai" class="form">
          <label class="field"><span>Z.AI API key</span><input class="input" name="zaiKey" type="password" autocomplete="off" placeholder="…" /><small>Saved in this browser only. FIZZ sends it to Z.AI when you use this provider.</small></label>
          <label class="field"><span>Model ID</span><input class="input mono" name="zaiModel" placeholder="glm-4.6" /><small>Global API endpoint: api.z.ai. Coding Plan users may need a different endpoint.</small></label>
        </div>
        <div data-sub="requesty" class="form">
          <label class="field"><span>Requesty AI API key</span><input class="input" name="requestyKey" type="password" autocomplete="off" placeholder="…" /><small>Saved in this browser only. FIZZ sends it to Requesty AI when you use this provider.</small></label>
          <label class="field"><span>Model ID</span><input class="input mono" name="requestyModel" placeholder="openai/gpt-4o-mini" /><small>Use a model ID available in Requesty's model catalog.</small></label>
        </div>
        <div data-sub="deepseek" class="form">
          <label class="field"><span>DeepSeek API key</span><input class="input" name="deepseekKey" type="password" autocomplete="off" placeholder="sk-…" /><small>Saved in this browser only. FIZZ sends it to DeepSeek when you use this provider.</small></label>
          <label class="field"><span>Model ID</span><input class="input mono" name="deepseekModel" placeholder="deepseek-chat" /><small>Use a model ID enabled for your account.</small></label>
        </div>
        <div data-sub="cerebras" class="form">
          <label class="field"><span>Cerebras API key</span><input class="input" name="cerebrasKey" type="password" autocomplete="off" placeholder="csk-…" /><small>Saved in this browser only. FIZZ sends it to Cerebras when you use this provider.</small></label>
          <label class="field"><span>Model ID</span><input class="input mono" name="cerebrasModel" placeholder="llama-3.3-70b" /><small>Use a model ID available in your Cerebras account.</small></label>
        </div>
        <div data-sub="together" class="form">
          <label class="field"><span>Together AI API key</span><input class="input" name="togetherKey" type="password" autocomplete="off" placeholder="…" /><small>Saved in this browser only. FIZZ sends it to Together AI when you use this provider.</small></label>
          <label class="field"><span>Model ID</span><input class="input mono" name="togetherModel" placeholder="meta-llama/Llama-3.3-70B-Instruct-Turbo" /><small>Use a model ID available in Together AI.</small></label>
        </div>
        <div data-sub="custom-openai" class="form">
          <label class="field"><span>API key</span><input class="input" name="customOpenAIKey" type="password" autocomplete="off" placeholder="Your provider API key" /><small>Stored in this browser only.</small></label>
          <label class="field"><span>Base URL</span><input class="input mono" name="customOpenAIBaseUrl" type="url" placeholder="https://api.example.com/v1" /><small>Use the provider's OpenAI-compatible base URL (not the full chat-completions URL).</small></label>
          <label class="field"><span>Model ID</span><input class="input mono" name="customOpenAIModel" placeholder="provider/model-name" /></label>
        </div>
      </div>
      <div data-pane="connections" class="form"><div class="conn-list" data-conn-list></div>
        <p class="muted-sm">Tokens for GitHub and Vercel are kept encrypted in a secure cookie that page scripts can't read. Google access lasts about an hour and stays in this tab only.</p></div>
      <div data-pane="tools" class="form">
        <div class="conn-list" data-tools></div>
        <label class="check"><input type="checkbox" name="cloudSync" /><span>Sync chats and projects to my RanEddie ID<small>Use them on every device. Images and PDFs stay in the browser that made them.</small></span></label>
        <label class="check"><input type="checkbox" name="autoFixBuilds" /><span>Fix failed app builds automatically<small>When an APK, AAB or desktop build fails, Fizz Code reads the log on GitHub, fixes the project and builds again (up to 6 attempts). Keep FIZZ DEV open while it works.</small></span></label>
        <div class="conn" data-tg-row><div class="conn-body"><b>Telegram updates</b><small>Get a Telegram message when Fizz finishes a task or needs you. Connect your Telegram bot (Connections → Apps), send it any message, then press Link.</small><small class="conn-state" data-tg-state></small></div><button type="button" class="btn btn-outline btn-sm" data-tg-link>Link</button></div>
        <label class="check"><input type="checkbox" name="autoVerify" /><span>Check Fizz Code's work automatically<small>When it finishes, FIZZ DEV checks the files it wrote (syntax, imports, links, errors in the preview) and has it fix what it finds.</small></span></label>
        <label class="field"><span>Steps per task</span><input class="input" type="number" name="agentSteps" min="5" max="40" step="1" /><small class="muted-sm">How many rounds Fizz Code may work on its own before it asks you to keep going (5–40).</small></label>
        <label class="check"><input type="checkbox" name="reviewChanges" /><span>Review file changes before they're applied</span></label>
        <label class="check"><input type="checkbox" name="askBeforeRun" /><span>Ask before Fizz Code runs commands<small>Off: it runs them in its own sandbox right away (every change can be undone).</small></span></label>
        <label class="check"><input type="checkbox" name="mcpAsk" data-mcp-ask /><span>Ask before every MCP call<small>Off: the first call to each MCP server asks once, then Fizz may keep using that server for the session. Calls that send, post or delete always ask. Fizz never sees the server's Authorization header — calls go through FIZZ's server.</small></span></label>
      </div>
      <div data-pane="account" class="form"><div data-acct></div></div>
      <p class="err" data-err style="color:var(--danger);margin:0;font-size:14px"></p>
      <div class="dlg-actions"><button class="btn btn-outline" value="cancel" formnovalidate>Cancel</button><button class="btn" value="save" data-save>Save</button></div>
    </form>`;
    document.body.appendChild(d);
    return d;
  }

  function connCard(c, st) {
    let state, action;
    if (c.id === "google") {
      const ok = st.google?.configured;
      const on = F.conn.google.connected();
      state = !ok ? "Not available yet" : on ? `Connected · ${esc(F.conn.google.account())}` : "Not connected";
      action = !ok ? "" : on ? `<button type="button" class="btn btn-outline btn-sm" data-disconnect="google">Disconnect</button>` : `<button type="button" class="btn btn-sm" data-connect="google">Connect</button>`;
    } else {
      const s = st.connections?.[c.id] || {};
      state = !s.configured ? "Not available yet" : s.connected ? `Connected · ${esc(s.account || "")}` : "Not connected";
      action = !s.configured ? "" : s.connected ? `<button type="button" class="btn btn-outline btn-sm" data-disconnect="${c.id}">Disconnect</button>` : `<button type="button" class="btn btn-sm" data-connect="${c.id}">Connect</button>`;
      if (s.connected && s.scopes?.length) state += ` <span class="mono muted-sm">(${esc(s.scopes.join(", "))})</span>`;
      if ((c.id === "vercel" || c.id === "github") && s.configured && !s.connected) {
        const help = c.id === "github" ? `<a href="https://github.com/settings/tokens/new?scopes=repo,workflow&description=FIZZ%20DEV" target="_blank" rel="noopener">Create a GitHub token</a> with <b>repo</b> and <b>workflow</b> ticked` : `Create one at <a href="https://vercel.com/account/settings/tokens" target="_blank" rel="noopener">vercel.com/account/settings/tokens</a>`;
        action = s.oauth ? `<button type="button" class="btn btn-outline btn-sm" data-connect="${c.id}">Sign in</button>` : "";
        return `<div class="conn">${c.icon}<div class="conn-body"><b>${c.name}</b><small>${c.desc}</small><small class="conn-state">${state}</small>
          <div class="vtoken"><input class="input mono" type="password" data-token="${c.id}" placeholder="Paste a ${c.name} token" autocomplete="off" spellcheck="false" /><button type="button" class="btn btn-sm" data-token-save="${c.id}">Connect</button></div>
          <small>${help} — kept encrypted.</small></div>${action}</div>`;
      }
    }
    return `<div class="conn">${c.icon}<div class="conn-body"><b>${c.name}</b><small>${c.desc}</small><small class="conn-state">${state}</small></div>${action}</div>`;
  }

  function accountPane(user) {
    const esc = F.esc;
    const signIn = `<a class="btn btn-sm rid-signin-btn" href="${esc(F.auth.url("signin"))}"><img src="assets/raneddie-logo.png" alt="" />Sign in with RanEddie ID</a>`;
    const exp = `<button type="button" class="btn btn-outline btn-sm" data-export>Export my data</button>`;
    if (user.rid) return `<div class="conn"><span class="avatar">${esc(user.name.slice(0, 1).toUpperCase())}</span><div class="conn-body"><b>${esc(user.name)}</b><small>${esc(user.email)}</small><small class="conn-state">Signed in with RanEddie ID</small></div></div>
      <p class="muted-sm">Your theme, response style, model and FIZZ DEV mode are saved to your RanEddie ID. API keys stay in this browser. Chats and projects sync to your account when cloud sync is on (Settings → Tools).</p>
      <div class="row-inline">${exp}<button type="button" class="btn btn-outline btn-sm" data-signout>Sign out</button></div>`;
    if (user.legacy) return `<p class="muted-sm">You're using an older FIZZ account saved only in this browser (${esc(user.email)}). Sign in with RanEddie ID to keep your settings on every device — your chats and projects stay here.</p>
      <div class="row-inline">${signIn}${exp}<button type="button" class="btn btn-outline btn-sm" data-signout>Sign out</button></div>`;
    return `<p class="muted-sm">You're using FIZZ without an account. Everything is saved in this browser. Sign in with your RanEddie ID — one account for FIZZ and RanEddie games — to keep your settings on every device.</p>
      <div class="row-inline">${signIn}<a class="btn btn-outline btn-sm" href="${esc(F.auth.url("signup"))}">Create a RanEddie ID</a>${exp}</div>`;
  }

  const TOOLS = [
    { k: "search", name: "Web search & reading pages", on: (st) => Boolean(st.tools), state: (st) => (st.tools?.search === "wikipedia" ? "On — Wikipedia only" : st.tools?.search ? `On — ${st.tools.search}` : "Off"), hint: "For results from the whole web, the site owner adds BROWSERBASE_API_KEY, BRAVE_SEARCH_API_KEY or TAVILY_API_KEY." },
    { k: "browser", name: "Cloud browser", on: (st) => Boolean(st.tools?.browser), state: (st) => (st.tools?.browser ? `On — ${st.tools.browserEngine === "browserbase" ? "Browserbase" : "Vercel Sandbox"}. Press Test it to check.` : "Off"), hint: "Lets Fizz Code open any site, click, type and sign in with you. On by default on Vercel (Vercel Sandbox); FIZZ_SANDBOX=off turns it off. Without it, Fizz Code opens the site for you and you paste what it needs." },
    { k: "sandbox", name: "Cloud sandbox", on: (st) => Boolean(st.tools?.sandbox), hint: "Fizz Code's own Linux computer (npm, git, Python). On by default on Vercel; FIZZ_SANDBOX=off turns it off." },
    { k: "builds", name: "Android & desktop apps", on: (st) => Boolean(st.connections?.github?.connected), state: (st) => (st.connections?.github?.connected ? "On — builds run in your GitHub" : st.connections?.github?.configured ? "Connect GitHub to turn on" : "Off"), hint: "APK, AAB, .exe, .dmg and AppImage, built by GitHub Actions in your repository." },
    { k: "sync", name: "Cloud sync", on: (st) => Boolean(st.tools?.sync), hint: "Needs RanEddie ID and Upstash Redis on the server." },
  ];
  async function renderTools(d) {
    const st = await F.serverStatus().catch(() => ({}));
    d.querySelector("[data-tools]").innerHTML = TOOLS.map((t) => {
      const on = t.on(st);
      const test = t.k === "browser" && on ? `<button type="button" class="btn btn-outline btn-sm" data-test-browser>Test it</button>` : "";
      return `<div class="conn"><span class="tool-dot ${on ? "on" : ""}" aria-hidden="true"></span><div class="conn-body"><b>${t.name}</b><small>${esc(t.hint)}</small><small class="conn-state" ${t.k === "browser" ? "data-browser-state" : ""}>${esc(t.state ? t.state(st) : on ? "On" : "Off")}</small></div>${test}</div>`;
    }).join("");
    d.querySelector("[name=cloudSync]").closest("label").classList.toggle("hidden", !st.tools?.sync);
    // The MCP checkbox only makes sense when the server can host MCP connections.
    d.querySelector("[data-mcp-ask]")?.closest("label").classList.toggle("hidden", !st.mcp?.configured);
  }

  async function renderConnections(d) {
    const box = d.querySelector("[data-conn-list]");
    box.innerHTML = `<p class="muted-sm">Checking connections…</p>`;
    const st = await F.serverStatus(true);
    const apps = (st.apps || []).map((a) => `<div class="conn"><span class="app-ic" aria-hidden="true">${esc(a.name.slice(0, 1))}</span><div class="conn-body"><b>${esc(a.name)}</b><small>${esc(a.desc)}</small><small class="conn-state">${a.connected ? `Connected · ${esc(a.account || "")}` : "Not connected"}</small>
      ${a.connected ? "" : `<div class="vtoken"><input class="input mono" type="password" data-app-token="${a.id}" placeholder="Paste your ${esc(a.name)} token" autocomplete="off" spellcheck="false" /><button type="button" class="btn btn-sm" data-app-save="${a.id}">Connect</button></div><small><a href="${esc(a.help)}" target="_blank" rel="noopener">Get a token</a> — ${esc(a.how)}</small>`}</div>${a.connected ? `<button type="button" class="btn btn-outline btn-sm" data-app-off="${a.id}">Disconnect</button>` : ""}</div>`).join("");
    box.innerHTML = (st.server ? "" : `<div class="alert alert-info"><div><strong>Connections need the FIZZ server</strong><p>Deploy this site from GitHub to Netlify (with the environment variables from the README) to enable GitHub, Vercel and Google.</p></div></div>`) + CONN.map((c) => connCard(c, st)).join("") + (apps ? `<h3 class="conn-group">Apps Fizz can use</h3><p class="muted-sm">Connect an app with your own token. Fizz creates and edits things there when you ask; sending, posting and deleting always wait for your OK.</p>${apps}` : "") + (await mcpSection(st));
  }

  /** MCP servers (Model Context Protocol): one card per server plus the form to connect another. */
  async function mcpSection(st) {
    if (!st.mcp?.configured) return "";
    const head = `<h3 class="conn-group">MCP servers</h3><p class="muted-sm">Add any MCP (Model Context Protocol) server by its URL and Fizz Code gets its tools — data, browsers, GitHub, Notion, your own services. The address and its Authorization header stay encrypted on the server; the page only ever sees the tool list.</p>`;
    let servers = null;
    if (F.conn?.mcp) servers = await F.conn.mcp.list().then((r) => (Array.isArray(r?.servers) ? r.servers : [])).catch(() => null);
    if (servers === null) return `${head}<p class="muted-sm">Connecting an MCP server needs the FIZZ server — deploy this site from GitHub to Netlify or Vercel.</p>`;
    const cards = servers
      .map((s) => {
        const tools = Array.isArray(s.tools) ? s.tools : [];
        const state = `${s.toolCount ?? tools.length} tool${(s.toolCount ?? tools.length) === 1 ? "" : "s"}${tools.length ? ` · ${esc(tools.slice(0, 3).map((x) => x.name).join(", "))}${tools.length > 3 ? "…" : ""}` : ""}`;
        return `<div class="conn"><span class="app-ic" aria-hidden="true">M</span><div class="conn-body"><b>${esc(s.name || "MCP server")}</b><small class="mono">${esc(s.url)}</small><small class="conn-state">${state}</small></div>
          <div class="conn-acts"><button type="button" class="btn btn-outline btn-sm" data-mcp-refresh="${esc(s.id)}">Refresh</button><button type="button" class="btn btn-outline btn-sm" data-mcp-off="${esc(s.id)}">Remove</button></div></div>`;
      })
      .join("");
    return `${head}${cards || `<p class="muted-sm">No MCP servers connected yet.</p>`}
      <div class="mcp-add">
        <input class="input mono" data-mcp-url type="url" placeholder="https://server.example/mcp" spellcheck="false" autocomplete="off" aria-label="MCP server URL" />
        <input class="input" data-mcp-name placeholder="Name (optional)" maxlength="40" autocomplete="off" aria-label="MCP server name" />
        <input class="input mono" type="password" data-mcp-auth placeholder="Authorization header (optional, e.g. Bearer …)" autocomplete="off" spellcheck="false" aria-label="Authorization header" />
        <button type="button" class="btn btn-sm" data-mcp-add>Connect</button>
      </div>
      <small class="muted-sm">Works with MCP servers reached over HTTP(S). A local <span class="mono">npx …</span> server needs a public URL first (a tunnel or a hosted endpoint), because the server on this site can't reach your computer.</small>`;
  }

  /**
   * Opens Settings. ctx = { user, data, save, onSaved(changed) }.
   */
  function open(ctx, tab = "general") {
    const d = ensureDialog();
    const f = d.querySelector("form");
    const s = ctx.data.settings;
    f.name.value = ctx.user.name;
    f.theme.value = F.theme.get();
    f.style.value = s.style;
    f.instructions.value = s.instructions;
    f.memory.value = (s.memory || []).join("\n");
    f.querySelectorAll("[name=provider]").forEach((r) => (r.checked = r.value === s.provider));
    f.openrouterKey.value = s.openrouterKey;
    f.openrouterModel.value = s.openrouterModel;
    f.geminiKey.value = s.geminiKey || "";
    f.geminiModel.value = s.geminiModel || "gemini-3.8-flash";
    f.apiKey.value = s.apiKey;
    for (const name of ["groqKey","groqModel","zaiKey","zaiModel","requestyKey","requestyModel","deepseekKey","deepseekModel","cerebrasKey","cerebrasModel","togetherKey","togetherModel","customOpenAIKey","customOpenAIBaseUrl","customOpenAIModel"]) {
      if (f.elements.namedItem(name)) f.elements.namedItem(name).value = s[name] || "";
    }
    f.model.innerHTML = F.MODELS.map((m) => `<option value="${m.id}">${m.chat} — ${m.note}</option>`).join("");
    f.model.value = s.model;
    f.name.closest("label").classList.toggle("hidden", !ctx.user.legacy);
    d.querySelector("[data-acct]").innerHTML = accountPane(ctx.user);
    d.querySelector("[data-err]").textContent = "";
    d.querySelector("[data-or-state]").textContent = s.openrouterKey ? "Key saved" : "";
    const sub = () => {
      const p = f.querySelector("[name=provider]:checked")?.value || "fizz";
      d.querySelectorAll("[data-sub]").forEach((x) => x.classList.toggle("hidden", x.dataset.sub !== p));
    };
    sub();
    const setTab = (t) => {
      d.querySelectorAll(".dlg-tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === t));
      d.querySelectorAll("[data-pane]").forEach((p) => p.classList.toggle("hidden", p.dataset.pane !== t));
      if (t === "connections") renderConnections(d);
      if (t === "tools") { renderTools(d); const tg = d.querySelector("[data-tg-state]"); if (tg) tg.textContent = ctx.data.settings.telegramChat ? "Linked" : "Not linked"; }
    };
    f.cloudSync.checked = s.cloudSync !== false;
    f.reviewChanges.checked = Boolean(s.reviewChanges);
    f.autoFixBuilds.checked = s.autoFixBuilds !== false;
    f.autoVerify.checked = s.autoVerify !== false;
    f.agentSteps.value = String(Math.min(40, Math.max(5, Number(s.agentSteps) || 20)));
    f.askBeforeRun.checked = Boolean(s.askBeforeRun);
    f.mcpAsk.checked = Boolean(s.mcpAsk);
    setTab(tab);
    F.serverStatus().then((st) => {
      d.querySelector("[data-ai-status]").textContent = st.ai?.configured
        ? `Included with your account — up to ${st.ai.dailyLimit} messages a day.`
        : "Not available on this deployment yet. Choose your own account below.";
    });

    d.onclick = async (e) => {
      const t = e.target.closest("button,input");
      if (!t) return;
      if (t.dataset.tab) setTab(t.dataset.tab);
      if (t.name === "provider") sub();
      if (t.hasAttribute("data-or-connect")) { ctx.data.settings.provider = "openrouter"; ctx.save(); F.openrouterConnect(); }
      if (t.hasAttribute("data-or-models")) {
        t.textContent = "Loading…";
        try {
          const r = await fetch("https://openrouter.ai/api/v1/models").then((x) => x.json());
          d.querySelector("#or-models").innerHTML = (r.data || []).map((m) => `<option value="${esc(m.id)}">${esc(m.name || m.id)}</option>`).join("");
          t.textContent = `${(r.data || []).length} models loaded`;
        } catch {
          t.textContent = "Couldn't load models";
        }
      }
      if (t.hasAttribute("data-gemini-models")) {
        const key = f.geminiKey.value.trim();
        const out = d.querySelector("[data-gemini-state]");
        if (!key) { out.textContent = "Paste your key first."; return; }
        out.textContent = "Checking your key…";
        try {
          const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=${encodeURIComponent(key)}`);
          const j = await r.json();
          if (!r.ok) throw new Error(j.error?.message || `Error ${r.status}`);
          const models = (j.models || []).filter((m) => (m.supportedGenerationMethods || []).includes("generateContent") && /gemini/i.test(m.name)).map((m) => m.name.replace(/^models\//, ""));
          d.querySelector("#gemini-models").innerHTML = models.map((m) => `<option value="${esc(m)}"></option>`).join("");
          out.textContent = `Key works — ${models.length} models available.`;
        } catch (err) { out.textContent = `That key didn't work: ${err.message}`; }
      }
      if (t.hasAttribute("data-test-browser")) {
        // Opens a page in the real cloud browser and reports exactly what happened.
        const out = d.querySelector("[data-browser-state]");
        t.disabled = true;
        const started = Date.now();
        const tick = setInterval(() => { out.textContent = `Starting the cloud browser… ${Math.round((Date.now() - started) / 1000)}s (the first time takes about a minute)`; }, 1000);
        try {
          let r = await F.conn.api("/api/browser", { body: { action: "open", url: "https://example.com" }, auth: true });
          while (r.starting && Date.now() - started < 4 * 60_000) { await new Promise((ok) => setTimeout(ok, 4000)); r = await F.conn.api("/api/browser", { body: { action: "open", url: "https://example.com" }, auth: true }); }
          out.textContent = r.starting ? "Still starting after 4 minutes — try again in a minute." : `Works — opened “${r.page?.title || r.page?.url}” in ${Math.round((Date.now() - started) / 1000)}s (${r.engine}).`;
        } catch (err) {
          out.textContent = `Didn't work: ${err.message}${err.status ? ` (${err.status})` : ""}`;
        } finally { clearInterval(tick); t.disabled = false; }
      }
      if (t.hasAttribute("data-tg-link")) {
        const out = d.querySelector("[data-tg-state]");
        try {
          const r = await F.conn.apps.call("telegram", { method: "GET", path: "/getUpdates", query: { limit: 20 } });
          const msg = (r.data?.result || []).map((u) => u.message || u.edited_message).filter(Boolean).at(-1);
          if (!msg) { out.textContent = "No message found — send your bot a message in Telegram, then press Link again."; return; }
          ctx.data.settings.telegramChat = String(msg.chat.id);
          ctx.data.settings.telegramNotify = true;
          ctx.save();
          await F.conn.apps.call("telegram", { method: "POST", path: "/sendMessage", body: { chat_id: msg.chat.id, text: "FIZZ DEV is linked. You'll get a message here when Fizz finishes a task or needs you." } });
          out.textContent = `Linked to ${msg.chat.first_name || msg.chat.title || "your chat"} — a test message was sent.`;
        } catch (err) { out.textContent = `Couldn't link: ${err.message}`; }
      }
      if (t.dataset.appSave) {
        const v = d.querySelector(`[data-app-token="${t.dataset.appSave}"]`)?.value.trim();
        if (!v) { F.toast("Paste the token first."); return; }
        t.disabled = true;
        try { const r = await F.conn.apps.connect(t.dataset.appSave, v); F.toast(`Connected${r.account ? ` · ${r.account}` : ""}`); renderConnections(d); } catch (err) { F.toast(err.message); t.disabled = false; }
      }
      if (t.dataset.appOff) {
        try { await F.conn.apps.disconnect(t.dataset.appOff); F.toast("Disconnected"); renderConnections(d); } catch (err) { F.toast(err.message); }
      }
      if (t.dataset.tokenSave) {
        const v = d.querySelector(`[data-token="${t.dataset.tokenSave}"]`)?.value.trim();
        if (!v) { F.toast("Paste the token first."); return; }
        t.disabled = true;
        try { const r = await F.conn.connectToken(t.dataset.tokenSave, v); F.toast(`Connected${r.account ? ` · ${r.account}` : ""}`); renderConnections(d); } catch (err) { F.toast(err.message); t.disabled = false; }
      }
      if (t.dataset.connect) {
        try { await F.conn.connect(t.dataset.connect); renderConnections(d); } catch (err) { F.toast(err.message); }
      }
      if (t.dataset.disconnect) {
        try { await F.conn.disconnect(t.dataset.disconnect); F.toast("Disconnected"); renderConnections(d); } catch (err) { F.toast(err.message); }
      }
      // MCP servers: connect (the handshake checks it first), remove, refresh the tool list.
      if (t.hasAttribute("data-mcp-add")) {
        const url = d.querySelector("[data-mcp-url]")?.value.trim();
        const name = d.querySelector("[data-mcp-name]")?.value.trim();
        const auth = d.querySelector("[data-mcp-auth]")?.value.trim();
        if (!url) { F.toast("Paste the MCP server's URL first."); return; }
        t.disabled = true;
        t.textContent = "Connecting…";
        try {
          const r = await F.conn.mcp.add(url, name, auth);
          F.toast(`Connected ${r.server?.name || "MCP server"} · ${r.server?.toolCount ?? 0} tools`);
          F.mcp?.changed?.();
          renderConnections(d);
        } catch (err) { F.toast(err.message); t.disabled = false; t.textContent = "Connect"; }
      }
      if (t.dataset.mcpOff) {
        t.disabled = true;
        try {
          await F.conn.mcp.remove(t.dataset.mcpOff);
          F.toast("MCP server removed");
          F.mcp?.changed?.();
          renderConnections(d);
        } catch (err) { F.toast(err.message); t.disabled = false; }
      }
      if (t.dataset.mcpRefresh) {
        t.disabled = true;
        t.textContent = "…";
        try {
          const r = await F.conn.mcp.refresh(t.dataset.mcpRefresh);
          F.toast(`Refreshed — ${r.server?.toolCount ?? 0} tools`);
          F.mcp?.changed?.();
          renderConnections(d);
        } catch (err) { F.toast(err.message); t.disabled = false; t.textContent = "Refresh"; }
      }
      if (t.hasAttribute("data-export")) F.download("fizz-export.json", JSON.stringify({ exportedAt: new Date().toISOString(), user: ctx.user, conversations: ctx.data.conversations, projects: ctx.data.projects }, null, 2));
      if (t.hasAttribute("data-signout")) { d.close(); F.auth.signOut(); }
    };
    f.onsubmit = async (e) => {
      if (e.submitter?.value !== "save") return;
      e.preventDefault();
      const name = f.name.value.trim();
      if (ctx.user.legacy && name && name !== ctx.user.name) { F.auth.rename(name); ctx.user.name = name; }
      F.theme.set(f.theme.value);
      Object.assign(s, {
        provider: f.querySelector("[name=provider]:checked")?.value || "fizz",
        openrouterKey: f.openrouterKey.value.trim(),
        openrouterModel: f.openrouterModel.value.trim() || "z-ai/glm-4.6",
        apiKey: f.apiKey.value.trim(),
        geminiKey: f.geminiKey.value.trim(),
        geminiModel: f.geminiModel.value.trim() || "gemini-3.8-flash",
        groqKey: f.groqKey.value.trim(),
        groqModel: f.groqModel.value.trim() || "llama-3.3-70b-versatile",
        zaiKey: f.zaiKey.value.trim(),
        zaiModel: f.zaiModel.value.trim() || "glm-4.6",
        requestyKey: f.requestyKey.value.trim(),
        requestyModel: f.requestyModel.value.trim() || "openai/gpt-4o-mini",
        deepseekKey: f.deepseekKey.value.trim(),
        deepseekModel: f.deepseekModel.value.trim() || "deepseek-chat",
        cerebrasKey: f.cerebrasKey.value.trim(),
        cerebrasModel: f.cerebrasModel.value.trim() || "llama-3.3-70b",
        togetherKey: f.togetherKey.value.trim(),
        togetherModel: f.togetherModel.value.trim() || "meta-llama/Llama-3.3-70B-Instruct-Turbo",
        customOpenAIKey: f.customOpenAIKey.value.trim(),
        customOpenAIBaseUrl: f.customOpenAIBaseUrl.value.trim(),
        customOpenAIModel: f.customOpenAIModel.value.trim(),
        model: f.model.value,
        style: f.style.value,
        instructions: f.instructions.value.trim(),
        memory: f.memory.value.split("\n").map((x) => x.trim()).filter(Boolean).slice(0, 60),
        cloudSync: f.cloudSync.checked,
        reviewChanges: f.reviewChanges.checked,
        autoFixBuilds: f.autoFixBuilds.checked,
        autoVerify: f.autoVerify.checked,
        agentSteps: Math.min(40, Math.max(5, Number(f.agentSteps.value) || 20)),
        askBeforeRun: f.askBeforeRun.checked,
        mcpAsk: f.mcpAsk.checked,
      });
      if (s.cloudSync) F.sync?.now();
      ctx.save();
      d.close();
      F.toast(ctx.user.rid ? "Settings saved to your RanEddie ID" : "Settings saved");
      ctx.onSaved?.();
    };
    d.showModal();
    // Open without a focus ring on the first tab (keyboard users still Tab into it).
    const body = d.querySelector(".dlg-body");
    body.tabIndex = -1;
    body.focus();
  }

  /** Call on page load: finishes an OpenRouter sign-in redirect if present. */
  // FIZZ and FIZZ DEV share one page, so the redirect is processed once and every app is told.
  let redirectRun = null;
  function handleRedirects(ctx) {
    redirectRun ||= processRedirects(ctx);
    redirectRun.then((key) => { if (key) ctx.onSaved?.(); });
  }
  async function processRedirects(ctx) {
    let key = null;
    try {
      key = await F.openrouterFinish();
      if (key) {
        Object.assign(ctx.data.settings, { provider: "openrouter", openrouterKey: key });
        ctx.save();
        F.toast("OpenRouter connected");
      }
    } catch (e) {
      F.toast(e.message);
    }
    const u = new URL(location.href);
    const ok = u.searchParams.get("connected");
    const bad = u.searchParams.get("connect_error");
    const reason = u.searchParams.get("reason");
    if (ok || bad) {
      ["connected", "connect_error", "reason"].forEach((k) => u.searchParams.delete(k));
      history.replaceState(null, "", u.pathname + u.search + u.hash);
      F.toast(ok ? `${ok[0].toUpperCase() + ok.slice(1)} connected` : `Couldn't connect ${bad}${reason ? `: ${reason}` : ""}. Please try again.`);
      F.serverStatus(true);
    }
    return key;
  }

  F.settings = { open, handleRedirects };
})();
