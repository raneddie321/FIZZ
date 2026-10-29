/* FIZZ connections: GitHub & Vercel (server OAuth via Netlify Functions), Google (Google Identity Services). */
(function () {
  "use strict";
  const F = window.FIZZ;

  async function api(path, opts = {}) {
    let res;
    const headers = {};
    if (opts.body) headers["Content-Type"] = "application/json";
    // FIZZ's own tools (search, sandbox, sync) know who is calling from the RanEddie ID session.
    if (opts.auth) { const t = await F.rid?.token?.(); if (t) headers.Authorization = `Bearer ${t}`; }
    try {
      res = await fetch(path, {
        method: opts.method || (opts.body ? "POST" : "GET"),
        credentials: "same-origin",
        headers,
        signal: opts.signal,
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      });
    } catch {
      throw new Error("Can't reach the FIZZ server. Check your connection.");
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const e = new Error(data?.error?.message || (res.status === 404 ? "This feature needs the FIZZ server (deploy the site from GitHub to Netlify)." : `Request failed (${res.status}).`));
      e.code = data?.error?.code;
      e.status = res.status;
      throw e;
    }
    return data;
  }

  // ---------- Google (token lives only in this tab, ~1 hour) ----------
  // Every Google Workspace app Fizz Code can use. Google's consent screen lets the user untick any of them.
  const GSCOPES = ["drive", "gmail.modify", "documents", "spreadsheets", "presentations", "calendar", "tasks", "contacts.readonly", "youtube"].map((s) => `https://www.googleapis.com/auth/${s}`).join(" ");
  let gToken = null;
  try {
    const saved = JSON.parse(sessionStorage.getItem("fizz.google") || "null");
    if (saved && saved.exp > Date.now()) gToken = saved;
  } catch {}

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

  async function googleConnect() {
    const st = await F.serverStatus();
    if (!st.google?.clientId) throw new Error("Google isn't configured on this server yet.");
    await loadGis();
    return new Promise((resolve, reject) => {
      const client = google.accounts.oauth2.initTokenClient({
        client_id: st.google.clientId,
        scope: GSCOPES,
        callback: async (resp) => {
          if (resp.error) return reject(new Error(resp.error_description || "Google sign-in was cancelled."));
          gToken = { t: resp.access_token, exp: Date.now() + (Number(resp.expires_in) || 3600) * 1000 - 60_000, label: "Google account", scopes: String(resp.scope || "").split(" ").filter(Boolean) };
          try {
            const about = await gfetch("https://www.googleapis.com/drive/v3/about?fields=user(displayName,emailAddress)");
            gToken.label = about.user?.emailAddress || about.user?.displayName || gToken.label;
          } catch {}
          sessionStorage.setItem("fizz.google", JSON.stringify(gToken));
          resolve(gToken);
        },
        error_callback: (e) => reject(new Error(e?.message || "Google sign-in was cancelled.")),
      });
      client.requestAccessToken({ prompt: "" });
    });
  }

  async function gfetch(url, init = {}) {
    if (!gToken || gToken.exp < Date.now()) throw Object.assign(new Error("Connect Google first."), { code: "not_connected" });
    const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${gToken.t}`, ...(init.headers || {}) } });
    if (res.status === 403) {
      const j = await res.clone().json().catch(() => null);
      const msg = j?.error?.message || "";
      if (/insufficient|scope/i.test(msg)) { gToken = null; sessionStorage.removeItem("fizz.google"); throw Object.assign(new Error("Google didn't give FIZZ access to this app (it was unticked when connecting). Connect Google again and leave it ticked."), { code: "not_connected" }); }
      if (/has not been used|is disabled|not enabled/i.test(msg)) throw Object.assign(new Error(`This Google API isn't turned on for the site's Google Cloud project yet. The site owner turns it on in console.cloud.google.com → APIs & Services → Library. (${msg.slice(0, 220)})`), { code: "api_disabled" });
    }
    if (res.status === 401) { gToken = null; sessionStorage.removeItem("fizz.google"); throw Object.assign(new Error("Your Google connection expired. Connect again."), { code: "not_connected" }); }
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
    has: (scope) => Boolean(gToken?.scopes?.some((s) => s.endsWith(`/${scope}`))),
    preload: () => loadGis().catch(() => {}),
    account: () => gToken?.label ?? null,
    connect: googleConnect,
    disconnect() {
      if (gToken && window.google?.accounts?.oauth2) google.accounts.oauth2.revoke(gToken.t, () => {});
      gToken = null;
      sessionStorage.removeItem("fizz.google");
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
    connect(provider) {
      if (provider === "google") return googleConnect();
      sessionStorage.setItem("fizz.conn.return", location.pathname.split("/").pop() || "dev.html");
      location.href = `/api/oauth/${provider}/start`;
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
    mcp: {
      list: () => api("/api/mcp/list", { auth: true }),
      add: (url, name, auth, extraHeaders = {}) => api("/api/mcp/add", { body: { url, name, headers: { ...(extraHeaders && typeof extraHeaders === "object" && !Array.isArray(extraHeaders) ? extraHeaders : {}), ...(auth ? { Authorization: auth } : {}) } }, auth: true }),
      remove: (id) => api("/api/mcp/remove", { body: { id }, auth: true }),
      refresh: (id) => api("/api/mcp/tools", { body: { id }, auth: true }),
      call: (id, tool, arguments_) => api("/api/mcp/call", { body: { id, tool, arguments: arguments_ }, auth: true }),
    },
    connectToken: async (provider, token) => { const r = await api(`/api/oauth/${provider}/token`, { body: { token } }); await F.serverStatus(true); return r; },
    vercel: {
      connectToken: async (token) => { const r = await api("/api/oauth/vercel/token", { body: { token } }); await F.serverStatus(true); return r; },
      deploy: (name, files, production) => api("/api/vercel/deploy", { body: { name, files, production } }),
      deployment: (id) => api(`/api/vercel/deployment?id=${encodeURIComponent(id)}`),
    },
    google: google_,
  };
})();
