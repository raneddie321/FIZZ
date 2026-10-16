/* Shared Settings dialog for FIZZ and FIZZ DEV: General, AI, Connections, Tools, Account. */
(function () {
  "use strict";
  const F = window.FIZZ;
  const { esc } = F;

  const CONN = [
    { id: "github", name: "GitHub", desc: "Import repositories and push your projects as commits.", icon: '<svg viewBox="0 0 24 24" class="i" aria-hidden="true"><path fill="currentColor" stroke="none" d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.46-1.16-1.11-1.47-1.11-1.47-.9-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.89 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02a9.6 9.6 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2z"/></svg>' },
    { id: "vercel", name: "Vercel", desc: "Deploy projects and get a live URL.", icon: '<svg viewBox="0 0 24 24" class="i" aria-hidden="true"><path fill="currentColor" stroke="none" d="M12 3l10 18H2z"/></svg>' },
    { id: "google", name: "Google Workspace", desc: "Import Google Docs, attach Drive files and export summaries to Docs.", icon: '<svg viewBox="0 0 24 24" class="i" aria-hidden="true"><path d="M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6"/></svg>' },
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
      </div>
      <div data-pane="ai" class="form">
        <div class="provider-list" role="radiogroup" aria-label="AI provider">
          <label class="provider"><input type="radio" name="provider" value="fizz" /><span><b>FIZZ AI</b><small data-ai-status>Checking…</small></span></label>
          <label class="provider"><input type="radio" name="provider" value="openrouter" /><span><b>Your OpenRouter account</b><small>Hundreds of models (GLM, Qwen, DeepSeek, Llama, Claude, GPT…). Usage is billed to your OpenRouter account; free models available.</small></span></label>
          <label class="provider"><input type="radio" name="provider" value="gemini" /><span><b>Your Google AI Studio key</b><small>Gemini models with your own key from aistudio.google.com — there's a free tier.</small></span></label>
          <label class="provider"><input type="radio" name="provider" value="anthropic" /><span><b>Your Anthropic API key</b><small>Use Claude models directly with your own key.</small></span></label>
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
      </div>
      <div data-pane="connections" class="form"><div class="conn-list" data-conn-list></div>
        <p class="muted-sm">Tokens for GitHub and Vercel are kept encrypted in a secure cookie that page scripts can't read. Google access lasts about an hour and stays in this tab only.</p></div>
      <div data-pane="tools" class="form">
        <div class="conn-list" data-tools></div>
        <label class="check"><input type="checkbox" name="cloudSync" /><span>Sync chats and projects to my RanEddie ID<small>Use them on every device. Images and PDFs stay in the browser that made them.</small></span></label>
        <label class="check"><input type="checkbox" name="autoFixBuilds" /><span>Fix failed app builds automatically<small>When an APK, AAB or desktop build fails, Fizz Code reads the log on GitHub, fixes the project and builds again (up to 6 attempts). Keep FIZZ DEV open while it works.</small></span></label>
        <label class="check"><input type="checkbox" name="autoVerify" /><span>Check Fizz Code's work automatically<small>When it finishes, FIZZ DEV checks the files it wrote (syntax, imports, links, errors in the preview) and has it fix what it finds.</small></span></label>
        <label class="field"><span>Steps per task</span><input class="input" type="number" name="agentSteps" min="5" max="40" step="1" /><small class="muted-sm">How many rounds Fizz Code may work on its own before it asks you to keep going (5–40).</small></label>
        <label class="check"><input type="checkbox" name="reviewChanges" /><span>Review file changes before they're applied</span></label>
        <label class="check"><input type="checkbox" name="askBeforeRun" /><span>Ask before Fizz Code runs commands<small>Off: it runs them in its own sandbox right away (every change can be undone).</small></span></label>
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
    { k: "browser", name: "Cloud browser", on: (st) => Boolean(st.tools?.browser), hint: "Lets Fizz Code open any site, click, type and sign in with you. The site owner adds BROWSERBASE_API_KEY." },
    { k: "sandbox", name: "Cloud sandbox", on: (st) => Boolean(st.tools?.sandbox), hint: "Fizz Code's own Linux computer (npm, git, Python). The site owner sets FIZZ_SANDBOX=on on Vercel." },
    { k: "builds", name: "Android & desktop apps", on: (st) => Boolean(st.connections?.github?.connected), state: (st) => (st.connections?.github?.connected ? "On — builds run in your GitHub" : st.connections?.github?.configured ? "Connect GitHub to turn on" : "Off"), hint: "APK, AAB, .exe, .dmg and AppImage, built by GitHub Actions in your repository." },
    { k: "sync", name: "Cloud sync", on: (st) => Boolean(st.tools?.sync), hint: "Needs RanEddie ID and Upstash Redis on the server." },
  ];
  async function renderTools(d) {
    const st = await F.serverStatus().catch(() => ({}));
    d.querySelector("[data-tools]").innerHTML = TOOLS.map((t) => {
      const on = t.on(st);
      return `<div class="conn"><span class="tool-dot ${on ? "on" : ""}" aria-hidden="true"></span><div class="conn-body"><b>${t.name}</b><small>${esc(t.hint)}</small><small class="conn-state">${esc(t.state ? t.state(st) : on ? "On" : "Off")}</small></div></div>`;
    }).join("");
    d.querySelector("[name=cloudSync]").closest("label").classList.toggle("hidden", !st.tools?.sync);
  }

  async function renderConnections(d) {
    const box = d.querySelector("[data-conn-list]");
    box.innerHTML = `<p class="muted-sm">Checking connections…</p>`;
    const st = await F.serverStatus(true);
    box.innerHTML = (st.server ? "" : `<div class="alert alert-info"><div><strong>Connections need the FIZZ server</strong><p>Deploy this site from GitHub to Netlify (with the environment variables from the README) to enable GitHub, Vercel and Google.</p></div></div>`) + CONN.map((c) => connCard(c, st)).join("");
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
    f.querySelectorAll("[name=provider]").forEach((r) => (r.checked = r.value === s.provider));
    f.openrouterKey.value = s.openrouterKey;
    f.openrouterModel.value = s.openrouterModel;
    f.geminiKey.value = s.geminiKey || "";
    f.geminiModel.value = s.geminiModel || "gemini-3.8-flash";
    f.apiKey.value = s.apiKey;
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
      if (t === "tools") renderTools(d);
    };
    f.cloudSync.checked = s.cloudSync !== false;
    f.reviewChanges.checked = Boolean(s.reviewChanges);
    f.autoFixBuilds.checked = s.autoFixBuilds !== false;
    f.autoVerify.checked = s.autoVerify !== false;
    f.agentSteps.value = String(Math.min(40, Math.max(5, Number(s.agentSteps) || 20)));
    f.askBeforeRun.checked = Boolean(s.askBeforeRun);
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
      if (t.dataset.connect) {
        try { await F.conn.connect(t.dataset.connect); renderConnections(d); } catch (err) { F.toast(err.message); }
      }
      if (t.dataset.disconnect) {
        try { await F.conn.disconnect(t.dataset.disconnect); F.toast("Disconnected"); renderConnections(d); } catch (err) { F.toast(err.message); }
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
        model: f.model.value,
        style: f.style.value,
        instructions: f.instructions.value.trim(),
        cloudSync: f.cloudSync.checked,
        reviewChanges: f.reviewChanges.checked,
        autoFixBuilds: f.autoFixBuilds.checked,
        autoVerify: f.autoVerify.checked,
        agentSteps: Math.min(40, Math.max(5, Number(f.agentSteps.value) || 20)),
        askBeforeRun: f.askBeforeRun.checked,
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
