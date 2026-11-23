/* Fizz connections: GitHub & Vercel (server OAuth via Netlify Functions), Google (Google Identity Services). */
(function () {
  "use strict";
  const F = window.FIZZ;

  let memDevice = "";
  // ---------- MCP vault (see F.conn.mcp) ----------
  const VAULT = "fizz.mcp.vault";
  let memVault = "";
  const getVault = () => { try { return localStorage.getItem(VAULT) || memVault; } catch { return memVault; } };
  const setVault = (v) => { memVault = v; try { localStorage.setItem(VAULT, v); } catch {} };
  let mcpChain = Promise.resolve();
  /** Changes go one at a time, so two of them never race over the same vault. */
  function mcpApi(action, body = {}) {
    const run = async () => {
      try {
        const r = await api(`/api/mcp/${action}`, { body: { ...body, vault: getVault() || undefined }, auth: true });
        if (r?.vault) setVault(r.vault);
        return r;
      } catch (e) {
        if (e.data?.vault) setVault(e.data.vault);
        throw e;
      }
    };
    if (action === "call") return run(); // tool calls run side by side; they only rarely refresh a sign-in
    const p = mcpChain.then(run, run);
    mcpChain = p.catch(() => {});
    return p;
  }
  function deviceId() {
    try {
      let id = localStorage.getItem("fizz.device");
      if (!/^[a-f0-9]{32}$/.test(id || "")) { id = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join(""); localStorage.setItem("fizz.device", id); }
      return id;
    } catch {
      // Storage blocked (some private modes): keep an id for this page instead.
      return (memDevice ||= [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join(""));
    }
  }
  async function api(path, opts = {}) {
    let res;
    const headers = {};
    if (opts.body) headers["Content-Type"] = "application/json";
    // Fizz's own tools (search, sandbox, sync) know who is calling from the RanEddie ID session.
    if (opts.auth) { const t = await F.rid?.token?.(); if (t) headers.Authorization = `Bearer ${t}`; }
    // A random id for this browser: keeps each device's cloud browser and limits apart when the site runs without
    // RanEddie ID on the server.
    if (opts.auth) headers["X-Fizz-Device"] = deviceId();
    try {
      res = await fetch(path, {
        method: opts.method || (opts.body ? "POST" : "GET"),
        credentials: "same-origin",
        headers,
        signal: opts.signal,
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      });
    } catch {
      throw new Error("Can't reach the Fizz server. Check your connection.");
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const e = new Error(data?.error?.message || (res.status === 404 ? "This feature needs the Fizz server (deploy the site from GitHub to Netlify)." : `Request failed (${res.status}).`));
      e.code = data?.error?.code;
      e.status = res.status;
      e.data = data;
      throw e;
    }
    return data;
  }

  // ---------- Google (an access token lasts ~1 hour; kept for that hour in this browser, shared by its tabs) ----------
  // Every Google Workspace app Fizz Code can use. Google's consent screen lets the user untick any of them.
  const GSCOPES = ["drive", "gmail.modify", "documents", "spreadsheets", "presentations", "calendar", "tasks", "contacts", "youtube", "forms.body", "forms.responses.readonly"].map((s) => `https://www.googleapis.com/auth/${s}`).join(" ");
  let gToken = null;
  const G_KEY = "fizz.google";
  const G_ACCOUNT = "fizz.google.account"; // the email last connected, so reconnecting is one click
  const gSave = (v) => { try { if (v) localStorage.setItem(G_KEY, JSON.stringify(v)); else localStorage.removeItem(G_KEY); sessionStorage.removeItem(G_KEY); } catch {} };
  try {
    const saved = JSON.parse(localStorage.getItem(G_KEY) || sessionStorage.getItem(G_KEY) || "null");
    if (saved && saved.exp > Date.now()) gToken = saved;
    else gSave(null);
  } catch {}
  // Another tab connected or disconnected Google: follow it here too.
  window.addEventListener("storage", (e) => {
    if (e.key !== G_KEY) return;
    try { const v = JSON.parse(e.newValue || "null"); gToken = v && v.exp > Date.now() ? v : null; } catch { gToken = null; }
  });

  function loadGis() {
    if (window.google?.accounts?.oauth2) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Couldn't load Google sign-in. Check your connection or ad blocker."));
      document.head.appendChild(s);
    });
  }

  async function googleConnect(extra = []) {
    const st = await F.serverStatus();
    if (!st.google?.clientId) throw new Error("Google isn't configured on this server yet.");
    await loadGis();
    return new Promise((resolve, reject) => {
      let hint = "";
      try { hint = localStorage.getItem(G_ACCOUNT) || ""; } catch {}
      const client = google.accounts.oauth2.initTokenClient({
        client_id: st.google.clientId,
        scope: [GSCOPES, ...extra.map((x) => (/^https:/.test(x) ? x : `https://www.googleapis.com/auth/${x}`))].join(" "),
        include_granted_scopes: true,
        ...(hint ? { hint } : {}),
        callback: async (resp) => {
          if (resp.error) return reject(new Error(resp.error_description || "Google sign-in was cancelled."));
          gToken = { t: resp.access_token, exp: Date.now() + (Number(resp.expires_in) || 3600) * 1000 - 60_000, label: "Google account", scopes: String(resp.scope || "").split(" ").filter(Boolean) };
          try {
            const about = await gfetch("https://www.googleapis.com/drive/v3/about?fields=user(displayName,emailAddress)");
            gToken.label = about.user?.emailAddress || about.user?.displayName || gToken.label;
          } catch {}
          gSave(gToken);
          try { if (/@/.test(gToken.label)) localStorage.setItem(G_ACCOUNT, gToken.label); } catch {}
          resolve(gToken);
        },
        error_callback: (e) => reject(new Error(e?.message || "Google sign-in was cancelled.")),
      });
      client.requestAccessToken(hint ? { prompt: "", login_hint: hint } : { prompt: "" });
    });
  }

  async function gfetch(url, init = {}) {
    if (!gToken || gToken.exp < Date.now()) throw Object.assign(new Error("Connect Google first."), { code: "not_connected" });
    const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${gToken.t}`, ...(init.headers || {}) } });
    if (res.status === 403) {
      const j = await res.clone().json().catch(() => null);
      const msg = j?.error?.message || "";
      if (/insufficient|scope/i.test(msg)) { gToken = null; gSave(null); throw Object.assign(new Error("Google didn't give Fizz access to this app (it was unticked when connecting). Connect Google again and leave it ticked."), { code: "not_connected" }); }
      if (/has not been used|is disabled|not enabled/i.test(msg)) throw Object.assign(new Error(`This Google API isn't turned on for the site's Google Cloud project yet. The site owner turns it on in console.cloud.google.com → APIs & Services → Library. (${msg.slice(0, 220)})`), { code: "api_disabled" });
    }
    if (res.status === 401) { gToken = null; gSave(null); throw Object.assign(new Error("Your Google connection expired. Connect again."), { code: "not_connected" }); }
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      throw new Error(j?.error?.message || `Google error ${res.status}`);
    }
    return (res.headers.get("content-type") || "").includes("json") ? res.json() : res.text();
  }

  const DRIVE = "https://www.googleapis.com/drive/v3/files";
  const google_ = {
    connected: () => Boolean(gToken && gToken.exp > Date.now()),
    /** Authorised fetch to any Google API (JSON in, JSON or text out). */
    fetch: (url, init) => gfetch(url, init),
    token: () => (gToken && gToken.exp > Date.now() ? gToken.t : null),
    has: (scope) => Boolean(gToken?.scopes?.some((s) => s.endsWith(`/${scope}`) || (scope === "contacts.readonly" && s.endsWith("/contacts")))),
    scopes: () => (gToken?.scopes || []).map((s) => s.replace("https://www.googleapis.com/auth/", "")),
    preload: () => loadGis().catch(() => {}),
    account: () => gToken?.label ?? null,
    connect: googleConnect,
    disconnect() {
      if (gToken && window.google?.accounts?.oauth2) google.accounts.oauth2.revoke(gToken.t, () => {});
      gToken = null;
      gSave(null);
      try { localStorage.removeItem(G_ACCOUNT); } catch {}
    },
    async listDocs(query = "") {
      const q = [`mimeType='application/vnd.google-apps.document'`, "trashed=false", query ? `name contains '${query.replace(/'/g, "\\'")}'` : ""].filter(Boolean).join(" and ");
      const r = await gfetch(`${DRIVE}?pageSize=30&orderBy=modifiedTime desc&fields=files(id,name,modifiedTime)&q=${encodeURIComponent(q)}`);
      return r.files || [];
    },
    async listFiles(query = "") {
      const q = ["trashed=false", "mimeType!='application/vnd.google-apps.folder'", query ? `name contains '${query.replace(/'/g, "\\'")}'` : ""].filter(Boolean).join(" and ");
      const r = await gfetch(`${DRIVE}?pageSize=30&orderBy=modifiedTime desc&fields=files(id,name,mimeType,size,modifiedTime)&q=${encodeURIComponent(q)}`);
      return r.files || [];
    },
    docText: (id) => gfetch(`${DRIVE}/${encodeURIComponent(id)}/export?mimeType=text/plain`),
    async fileAsAttachment(file) {
      if (file.mimeType === "application/vnd.google-apps.document") return { type: "text", name: `${file.name}.txt`, text: String(await google_.docText(file.id)).slice(0, 200000) };
      if (file.mimeType === "application/vnd.google-apps.spreadsheet") return { type: "text", name: `${file.name}.csv`, text: String(await gfetch(`${DRIVE}/${file.id}/export?mimeType=text/csv`)).slice(0, 200000) };
      if (file.size && Number(file.size) > 5 * 1024 * 1024) throw new Error(`"${file.name}" is larger than 5 MB.`);
      const res = await fetch(`${DRIVE}/${encodeURIComponent(file.id)}?alt=media`, { headers: { Authorization: `Bearer ${gToken.t}` } });
      if (!res.ok) throw new Error(`Couldn't download "${file.name}".`);
      const blob = await res.blob();
      return F.readAttachment(new File([blob], file.name, { type: file.mimeType }));
    },
    async createDoc(title, text) {
      const boundary = "fizz" + Math.random().toString(36).slice(2);
      const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: title, mimeType: "application/vnd.google-apps.document" })}\r\n--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${text}\r\n--${boundary}--`;
      return gfetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink", { method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body });
    },
  };

  F.conn = {
    api,
    status: (force) => F.serverStatus(force),
    connect(provider, params = null) {
      if (provider === "google") return googleConnect();
      sessionStorage.setItem("fizz.conn.return", location.pathname.split("/").pop() || "dev.html");
      location.href = `/api/oauth/${provider}/start${params ? `?${new URLSearchParams(params)}` : ""}`;
    },
    async disconnect(provider) {
      if (provider === "google") return google_.disconnect();
      await api(`/api/oauth/${provider}/disconnect`, { method: "POST", body: {} });
      await F.serverStatus(true);
    },
    github: {
      repos: () => api("/api/github/repos"),
      create: (name, isPrivate, description) => api("/api/github/create", { body: { name, private: isPrivate, description } }),
      import: (owner, repo, branch) => api("/api/github/import", { body: { owner, repo, branch } }),
      push: (owner, repo, branch, message, files) => api("/api/github/push", { body: { owner, repo, branch, message, files } }),
      runs: (owner, repo, workflow) => api(`/api/github/runs?${new URLSearchParams({ owner, repo, ...(workflow ? { workflow } : {}) })}`),
      jobs: (owner, repo, runId) => api(`/api/github/jobs?${new URLSearchParams({ owner, repo, runId })}`),
      log: (owner, repo, jobId) => api(`/api/github/log?${new URLSearchParams({ owner, repo, jobId })}`),
      artifacts: (owner, repo, runId) => api(`/api/github/artifacts?${new URLSearchParams({ owner, repo, runId })}`),
      artifactUrl: (owner, repo, id) => api(`/api/github/artifact?${new URLSearchParams({ owner, repo, id })}`),
      dispatch: (owner, repo, branch, workflow, inputs) => api("/api/github/dispatch", { body: { owner, repo, branch, workflow, inputs } }),
      pushTo: (opts) => api("/api/github/push", { body: opts }),
      prs: (owner, repo, opts = {}) => api(`/api/github/prs?${new URLSearchParams({ owner, repo, ...opts })}`),
      prCreate: (opts) => api("/api/github/pr-create", { body: opts }),
      pr: (owner, repo, number) => api(`/api/github/pr?${new URLSearchParams({ owner, repo, number })}`),
      prReply: (opts) => api("/api/github/pr-reply", { body: opts }),
      rerun: (owner, repo, runId) => api("/api/github/rerun", { body: { owner, repo, runId } }),
      merge: (owner, repo, number, method) => api("/api/github/merge", { body: { owner, repo, number, method } }),
    },
    web: {
      search: (q, count = 8) => api(`/api/web/search?${new URLSearchParams({ q, count })}`, { auth: true }),
      read: (url, max, opts = {}) => api(`/api/web/read?${new URLSearchParams({ url, ...(max ? { max } : {}), ...(opts.raw ? { raw: "1" } : {}) })}`, { auth: true }),
      frame: (url) => api(`/api/web/frame?${new URLSearchParams({ url })}`, { auth: true }),
    },
    sandbox: (body, signal) => api("/api/sandbox", { body, auth: true, signal }),
    sync: {
      index: () => api("/api/sync", { auth: true }),
      get: (id) => api(`/api/sync?id=${encodeURIComponent(id)}`, { auth: true }),
      put: (item) => api("/api/sync", { method: "PUT", body: item, auth: true }),
      remove: (id) => api(`/api/sync?id=${encodeURIComponent(id)}`, { method: "DELETE", auth: true }),
    },
    apps: {
      connect: async (id, token) => { const r = await api(`/api/connector/${id}/token`, { body: { token } }); await F.serverStatus(true); return r; },
      disconnect: async (id) => { await api(`/api/connector/${id}/disconnect`, { body: {} }); await F.serverStatus(true); },
      call: (id, req) => api(`/api/connector/${id}/call`, { body: req }),
    },
    // MCP (Model Context Protocol) servers: the URL is saved on the server with its headers, so the
    // browser only ever gets the server's name and its tool list.
    // Without a database on the site, the list lives in an encrypted vault in this browser (only the server can
    // open it); it's sent with each request and the server hands back a new one after every change.
    mcp: {
      list: () => mcpApi("list"),
      add: (url, name, auth, extraHeaders = {}) => mcpApi("add", { url, name, headers: { ...(extraHeaders && typeof extraHeaders === "object" && !Array.isArray(extraHeaders) ? extraHeaders : {}), ...(auth ? { Authorization: auth } : {}) } }),
      remove: (id) => mcpApi("remove", { id }),
      refresh: (id) => mcpApi("tools", { id }),
      call: (id, tool, arguments_) => mcpApi("call", { id, tool, arguments: arguments_ }),
    },
    canva: { call: (req) => api("/api/connector/canva/call", { body: req }) },
    shopify: { graphql: (query, variables) => api("/api/connector/shopify-store/call", { body: { query, variables } }) },
    connectToken: async (provider, token) => { const r = await api(`/api/oauth/${provider}/token`, { body: { token } }); await F.serverStatus(true); return r; },
    vercel: {
      connectToken: async (token) => { const r = await api("/api/oauth/vercel/token", { body: { token } }); await F.serverStatus(true); return r; },
      deploy: (name, files, production) => api("/api/vercel/deploy", { body: { name, files, production } }),
      deployment: (id) => api(`/api/vercel/deployment?id=${encodeURIComponent(id)}`),
    },
    google: google_,
  };
})();
