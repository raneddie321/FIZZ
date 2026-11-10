/* Custom connectors (MCP servers), like "Add custom connector" in Claude:
   step 1 — a name and the server's URL; step 2 — FIZZ asks the server how it wants to be signed in to and
   pre-selects that (Sign in now / Sign in when needed / No sign-in; register FIZZ automatically or use your
   own OAuth client; up to four request headers; scope under Advanced). Sign-in happens on the server's own
   page; the tokens stay on FIZZ's server. Settings → Connections lists them with Reconnect and Remove. */
(function () {
  "use strict";
  const F = window.FIZZ;
  const esc = F.esc;
  const api = (path, body) => F.conn.api(path, { body, auth: true });

  // ---------- coming back from a server's sign-in page ----------
  (function returned() {
    const q = new URLSearchParams(location.search);
    const ok = q.get("mcp_connected"), err = q.get("mcp_error");
    if (!ok && !err) return;
    q.delete("mcp_connected"); q.delete("mcp_error");
    history.replaceState(null, "", location.pathname + (q.toString() ? `?${q}` : "") + location.hash);
    setTimeout(() => {
      F.toast(ok ? `${ok} is connected — Fizz can use its tools now.` : `Couldn't connect: ${err}`);
      F.mcp?.refresh?.(true);
    }, 600);
  })();

  // ---------- the dialog ----------
  let dlg = null;
  let st = null; // { step, name, url, detected, auth, client, clientId, clientSecret, headers: [[k,v]], scope, busy, error }
  function ensure() {
    if (dlg) return dlg;
    dlg = document.createElement("dialog");
    dlg.className = "dlg cc-dlg";
    dlg.setAttribute("aria-label", "Add custom connector");
    document.body.appendChild(dlg);
    dlg.addEventListener("click", onClick);
    dlg.addEventListener("input", onInput);
    dlg.addEventListener("change", onInput);
    dlg.addEventListener("cancel", () => { st = null; });
    return dlg;
  }
  const radio = (name, value, label, desc, { checked, detected, disabled } = {}) => `<label class="cc-opt${disabled ? " off" : ""}"><input type="radio" name="${name}" value="${value}" ${checked ? "checked" : ""} ${disabled ? "disabled" : ""}/><span><b>${label}${detected ? ' <span class="cc-badge">Detected</span>' : ""}</b><small>${desc}</small></span></label>`;
  const WARN = `<p class="cc-warn">Only use connectors from developers you trust. FIZZ doesn't control which tools a server offers and can't verify that they work as intended or won't change.</p>`;

  function render() {
    const d = ensure();
    const errHtml = st.error ? `<p class="cc-err" role="alert">${esc(st.error)}</p>` : "";
    if (st.step === 1) {
      d.innerHTML = `<form class="dlg-body cc" data-cc-form><h2>Add custom connector</h2>
        <label class="field"><span class="sr-only">Name</span><input class="input" name="name" placeholder="Name" maxlength="40" value="${esc(st.name)}" autocomplete="off" /><small class="muted-sm">Shown in the connectors list.</small></label>
        <label class="field"><span class="sr-only">MCP server URL</span><input class="input mono" name="url" placeholder="MCP server URL" value="${esc(st.url)}" inputmode="url" autocomplete="off" spellcheck="false" /><small class="muted-sm">The HTTPS address where the server accepts MCP requests, for example https://mcp.example.com/mcp.</small></label>
        ${WARN}${errHtml}
        <div class="dlg-actions"><button type="button" class="btn btn-outline" data-cc="close">Cancel</button><button class="btn" data-cc="continue" ${validUrl(st.url) && !st.busy ? "" : "disabled"}>${st.busy ? "Checking…" : "Continue"}</button></div></form>`;
      setTimeout(() => d.querySelector(st.name ? "[name=url]" : "[name=name]")?.focus(), 0);
      return;
    }
    const det = st.detected || {};
    const oauthOn = st.auth !== "none";
    d.innerHTML = `<form class="dlg-body cc" data-cc-form><h2>Add custom connector</h2>
      <div class="cc-head"><b>${esc(st.name || hostOf(st.url))}</b><code>${esc(st.url)}</code></div>
      <fieldset class="cc-group"><legend>Authentication</legend>
        ${radio("auth", "now", "Sign in now", "You sign in through the server's own page before Fizz can use any tools.", { checked: st.auth === "now", detected: det.auth === "oauth" })}
        ${radio("auth", "needed", "Sign in when needed", "FIZZ connects without signing in first and asks you to sign in only if the server requires it. Pick this for servers that offer some tools without an account.", { checked: st.auth === "needed" })}
        ${radio("auth", "none", "No sign-in", "For servers with open access, or servers that use an API key instead of OAuth (add it as a request header below).", { checked: st.auth === "none", detected: det.auth === "none" })}
      </fieldset>
      ${oauthOn ? `<fieldset class="cc-group"><legend>OAuth client</legend>
        ${radio("client", "auto", "Register automatically", "FIZZ registers itself with the server when you sign in (Dynamic Client Registration). Works with most servers.", { checked: st.client === "auto", detected: det.dcr })}
        ${radio("client", "own", "Use your own OAuth client", "Enter a client ID you registered with the server yourself. Leave the secret blank unless the server requires one.", { checked: st.client === "own" })}
        ${st.client === "own" ? `<div class="cc-own"><input class="input mono" name="clientId" placeholder="Client ID" value="${esc(st.clientId)}" autocomplete="off" spellcheck="false" /><input class="input mono" type="password" name="clientSecret" placeholder="Client secret (optional)" value="${esc(st.clientSecret)}" autocomplete="off" /><small class="muted-sm">Redirect URL to register: <code>${esc(location.origin)}/api/mcp/oauth-callback</code></small></div>` : ""}
      </fieldset>` : ""}
      <fieldset class="cc-group"><legend>Request headers</legend><small class="muted-sm">Sent with every request${oauthOn ? " alongside the OAuth token" : ""}. Values are stored securely on FIZZ's server and never shown again. You can add up to four.</small>
        ${st.headers.map(([k, v], i) => `<div class="cc-hdr"><input class="input mono" data-hk="${i}" placeholder="Header name" value="${esc(k)}" autocomplete="off" spellcheck="false" /><input class="input mono" type="password" data-hv="${i}" placeholder="Value" value="${esc(v)}" autocomplete="off" /><button type="button" class="icon-btn" data-cc-del="${i}" aria-label="Remove header">${F.icon("x")}</button></div>`).join("")}
        ${st.headers.length < 4 ? `<button type="button" class="btn btn-outline btn-sm cc-add" data-cc="header">${F.icon("plus")}Add header</button>` : ""}
      </fieldset>
      ${oauthOn ? `<details class="cc-adv" ${st.scope ? "open" : ""}><summary>Advanced</summary><label class="field"><span>Scope</span><input class="input mono" name="scope" placeholder="${esc((det.scopes || []).join(" ") || "Default scopes")}" value="${esc(st.scope)}" autocomplete="off" spellcheck="false" /><small class="muted-sm">Leave empty to ask for the scopes the server lists.</small></label></details>` : ""}
      ${WARN}${errHtml}
      <div class="dlg-actions"><button type="button" class="btn btn-outline" data-cc="back" ${st.busy ? "disabled" : ""}>Back</button><button class="btn" data-cc="add" ${st.busy ? "disabled" : ""}>${st.busy ? (st.auth === "none" ? "Connecting…" : "Opening sign-in…") : "Add"}</button></div></form>`;
  }

  const validUrl = (u) => { try { const x = new URL(String(u).trim()); return x.protocol === "https:" || x.protocol === "http:"; } catch { return false; } };
  const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return "MCP server"; } };
  const headersObj = () => Object.fromEntries(st.headers.map(([k, v]) => [String(k).trim(), String(v)]).filter(([k, v]) => k && v));

  function onInput(e) {
    const t = e.target;
    if (!st) return;
    if (t.name === "name") st.name = t.value;
    if (t.name === "url") { st.url = t.value; const b = dlg.querySelector('[data-cc="continue"]'); if (b) b.disabled = !validUrl(st.url) || st.busy; }
    if (t.name === "clientId") st.clientId = t.value;
    if (t.name === "clientSecret") st.clientSecret = t.value;
    if (t.name === "scope") st.scope = t.value;
    if (t.dataset.hk !== undefined) st.headers[+t.dataset.hk][0] = t.value;
    if (t.dataset.hv !== undefined) st.headers[+t.dataset.hv][1] = t.value;
    if (e.type === "change" && (t.name === "auth" || t.name === "client")) { st[t.name] = t.value; st.error = ""; render(); }
  }

  async function onClick(e) {
    const b = e.target.closest("[data-cc],[data-cc-del]");
    if (!b || !st) return;
    const what = b.dataset.cc;
    if (b.dataset.ccDel !== undefined) { st.headers.splice(+b.dataset.ccDel, 1); return render(); }
    if (what === "close") { e.preventDefault(); dlg.close(); st = null; return; }
    if (what === "header") { st.headers.push(["", ""]); render(); dlg.querySelector(`[data-hk="${st.headers.length - 1}"]`)?.focus(); return; }
    if (what === "back") { e.preventDefault(); st.step = 1; st.error = ""; return render(); }
    if (what === "continue") { e.preventDefault(); return next(); }
    if (what === "add") { e.preventDefault(); return add(); }
  }

  async function next() {
    if (!validUrl(st.url)) { st.error = "Enter the server's full address, starting with https://"; return render(); }
    st.busy = true; st.error = ""; render();
    try {
      st.detected = await api("/api/mcp/discover", { url: st.url.trim() });
      st.auth = st.detected.auth === "oauth" ? "now" : st.detected.auth === "none" ? "none" : "needed";
      st.client = "auto";
      st.step = 2;
    } catch (err) {
      st.error = err.message;
    }
    st.busy = false;
    render();
  }

  async function startOAuth() {
    const r = await api("/api/mcp/oauth-start", {
      url: st.url.trim(), name: st.name.trim(), headers: headersObj(), scope: st.scope.trim(),
      clientId: st.client === "own" ? st.clientId.trim() : "", clientSecret: st.client === "own" ? st.clientSecret : "",
      returnTo: location.pathname.replace(/\/$/, "") || "/dev.html",
    });
    // Off to the server's own sign-in page; it sends the user back to FIZZ when done.
    location.href = r.authorizeUrl;
  }

  async function add() {
    if (st.client === "own" && st.auth !== "none" && !st.clientId.trim()) { st.error = "Enter your OAuth client ID, or choose Register automatically."; return render(); }
    st.busy = true; st.error = ""; render();
    try {
      if (st.auth === "now") return await startOAuth();
      try {
        const r = await F.conn.mcp.add(st.url.trim(), st.name.trim(), null, headersObj());
        F.toast(`${r.server?.name || st.name || "Connector"} is connected — ${r.server?.toolCount ?? 0} tools.`);
        dlg.close(); st = null;
        await F.mcp?.refresh?.(true);
        onChange?.();
        return;
      } catch (err) {
        if (st.auth === "needed" && (err.status === 401 || /sign in/i.test(err.message))) return await startOAuth();
        throw err;
      }
    } catch (err) {
      st.busy = false;
      st.error = err.message;
      render();
    }
  }

  let onChange = null;
  function open(opts = {}) {
    onChange = opts.onChange || null;
    st = { step: 1, name: opts.name || "", url: opts.url || "", detected: null, auth: "now", client: "auto", clientId: "", clientSecret: "", headers: [], scope: "", busy: false, error: "" };
    render();
    ensure().showModal();
    if (opts.url) next();
  }

  /** The list for Settings → Connections. */
  async function listHtml() {
    let servers = [];
    try { servers = (await F.conn.mcp.list()).servers || []; } catch { return `<p class="muted-sm">Custom connectors are unavailable right now.</p>`; }
    const rows = servers.map((s) => `<div class="conn"><span class="app-ic" aria-hidden="true">${esc((s.name || "M").slice(0, 1).toUpperCase())}</span><div class="conn-body"><b>${esc(s.name)}</b><small class="mono">${esc(s.url)}</small><small class="conn-state">${s.toolCount} tool${s.toolCount === 1 ? "" : "s"} · ${s.auth === "oauth" ? "signed in" : s.auth === "headers" ? "API key / headers" : "no sign-in"}</small></div><div class="row-inline">${s.auth === "oauth" ? `<button type="button" class="btn btn-outline btn-sm" data-cc-reconnect="${esc(s.id)}" data-url="${esc(s.url)}" data-name="${esc(s.name)}">Reconnect</button>` : ""}<button type="button" class="btn btn-outline btn-sm" data-cc-remove="${esc(s.id)}">Remove</button></div></div>`).join("");
    return `<h3 class="conn-group">Custom connectors</h3><p class="muted-sm">Connect any MCP server by its URL. Fizz uses its tools when you ask; tools that send, post or delete ask you first.</p>${rows}<button type="button" class="btn btn-outline btn-sm" data-cc-open>${F.icon("plus")}Add custom connector</button>`;
  }
  /** Handles the list's buttons; returns true when it handled the click. */
  async function handleListClick(t, rerender) {
    if (t.closest("[data-cc-open]")) { open({ onChange: rerender }); return true; }
    const rc = t.closest("[data-cc-reconnect]");
    if (rc) { open({ url: rc.dataset.url, name: rc.dataset.name, onChange: rerender }); return true; }
    const rm = t.closest("[data-cc-remove]");
    if (rm) {
      rm.disabled = true;
      try { await F.conn.mcp.remove(rm.dataset.ccRemove); F.toast("Connector removed"); await F.mcp?.refresh?.(true); rerender?.(); } catch (err) { F.toast(err.message); rm.disabled = false; }
      return true;
    }
    return false;
  }

  F.customConnectors = { open, listHtml, handleListClick };
})();
