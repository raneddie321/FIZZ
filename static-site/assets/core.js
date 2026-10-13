/* FIZZ core: storage, RANEDDIE ID accounts (stored in this browser), theme, AI client. */
(function () {
  "use strict";

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { FIZZ.toast("Browser storage is full. Delete some chats or projects."); return false; } },
    del(k) { try { localStorage.removeItem(k); } catch {} },
  };

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

  // ---------- theme ----------
  function applyTheme(t) {
    const dark = t === "dark" || (t !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
  }
  const theme = {
    get: () => store.get("fizz.theme", "system"),
    set(t) { store.set("fizz.theme", t); applyTheme(t); },
    init() { applyTheme(this.get()); matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => applyTheme(this.get())); },
  };

  // ---------- accounts ----------
  const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  async function hashPassword(password, saltB64) {
    const salt = saltB64 ? Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0)) : crypto.getRandomValues(new Uint8Array(16));
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 210000 }, key, 256);
    return { salt: b64(salt), hash: b64(bits) };
  }
  const users = () => store.get("fizz.users", {});
  const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
  const strongPassword = (p) => p.length >= 8 && /[a-zA-Z]/.test(p) && /\d/.test(p);

  const auth = {
    current() {
      const s = store.get("fizz.session", null);
      if (!s) return null;
      if (s.expires && s.expires < Date.now()) { store.del("fizz.session"); return null; }
      const u = users()[s.email];
      return u ? { id: u.id, name: u.name, email: u.email, created: u.created } : null;
    },
    startSession(email, remember) {
      store.set("fizz.session", { email, expires: Date.now() + (remember ? 30 : 1) * 86400000 });
    },
    async signUp({ name, email, password, confirm, terms }) {
      name = String(name || "").trim();
      email = String(email || "").trim().toLowerCase();
      if (!name) return { field: "name", error: "Enter your name." };
      if (!validEmail(email)) return { field: "email", error: "Enter a valid email address." };
      if (!strongPassword(password)) return { field: "password", error: "Use at least 8 characters with letters and numbers." };
      if (password !== confirm) return { field: "confirm", error: "The passwords don't match." };
      if (!terms) return { field: "terms", error: "Please accept the Terms of Service." };
      const all = users();
      if (all[email]) return { field: "email", error: "An account with this email already exists. Sign in instead." };
      const { salt, hash } = await hashPassword(password);
      all[email] = { id: uid(), name, email, salt, hash, created: Date.now() };
      store.set("fizz.users", all);
      this.startSession(email, true);
      return { ok: true };
    },
    async signIn({ email, password, remember }) {
      email = String(email || "").trim().toLowerCase();
      const u = users()[email];
      const { hash } = await hashPassword(String(password || ""), u ? u.salt : undefined);
      if (!u || hash !== u.hash) return { error: "That email and password combination is incorrect." };
      this.startSession(email, remember !== false);
      return { ok: true };
    },
    async changePassword(current, next) {
      const me = this.current();
      const all = users();
      const u = all[me.email];
      if ((await hashPassword(current, u.salt)).hash !== u.hash) return "Your current password is incorrect.";
      if (!strongPassword(next)) return "Use at least 8 characters with letters and numbers.";
      Object.assign(u, await hashPassword(next));
      store.set("fizz.users", all);
      return null;
    },
    rename(name) {
      const me = this.current();
      const all = users();
      all[me.email].name = name;
      store.set("fizz.users", all);
    },
    signOut() { store.del("fizz.session"); location.href = "index.html"; },
    deleteAccount() {
      const me = this.current();
      const all = users();
      delete all[me.email];
      store.set("fizz.users", all);
      store.del(`fizz.data.${me.id}`);
      store.del("fizz.session");
      location.href = "index.html";
    },
    resetLocal(email) {
      email = String(email || "").trim().toLowerCase();
      const all = users();
      if (!all[email]) return false;
      store.del(`fizz.data.${all[email].id}`);
      delete all[email];
      store.set("fizz.users", all);
      return true;
    },
    /** Redirects to sign-in when there is no session. */
    require() {
      const u = this.current();
      if (!u) {
        location.replace(`signin.html?next=${encodeURIComponent(location.pathname.split("/").pop() || "chat.html")}`);
        throw new Error("redirecting");
      }
      return u;
    },
  };

  // ---------- per-user data ----------
  // One shared object per user, so FIZZ and FIZZ DEV running on the same page never overwrite each other.
  const dataCache = {};
  function loadData(user) {
    if (dataCache[user.id]) return dataCache[user.id];
    const d = (dataCache[user.id] = store.get(`fizz.data.${user.id}`, null) || {});
    d.settings = Object.assign({ provider: "fizz", apiKey: "", openrouterKey: "", openrouterModel: "z-ai/glm-4.6", instructions: "", model: "claude-opus-5-5", style: "balanced" }, d.settings || {});
    d.conversations ||= [];
    d.projects ||= [];
    return d;
  }
  const saveData = (user, d) => store.set(`fizz.data.${user.id}`, d);

  // ---------- AI (Anthropic Messages API, streamed) ----------
  const MODELS = [
    { id: "claude-opus-5-5", chat: "FIZZ 1.0", dev: "Fizz Code 1.0", note: "Most capable — reasoning, writing and code" },
    { id: "claude-sonnet-5-5", chat: "FIZZ Swift", dev: "Fizz Code Swift", note: "Fast and capable for everyday work" },
    { id: "claude-haiku-5-5", chat: "FIZZ Lite", dev: "Fizz Lite", note: "Quickest for simple questions" },
  ];

  async function streamChat({ apiKey, model, system, messages, signal, onText }) {
    if (!apiKey) throw new Error("NO_KEY");
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({ model, max_tokens: 32000, stream: true, system, messages }),
    }).catch((e) => {
      if (e.name === "AbortError") throw e;
      throw new Error("Couldn't reach the AI service. Check your internet connection.");
    });
    if (!res.ok) {
      let msg = `The AI service returned an error (${res.status}).`;
      try { msg = (await res.json()).error?.message || msg; } catch {}
      if (res.status === 401) msg = "Your API key was rejected. Check it in Settings.";
      if (res.status === 429) msg = "Too many requests right now. Wait a moment and try again.";
      if (res.status === 529 || res.status >= 500) msg = "The AI service is busy. Please try again.";
      throw new Error(msg);
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "", text = "", stop = null;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n\n")) !== -1) {
        const raw = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const line = raw.split("\n").find((l) => l.startsWith("data:"));
        if (!line) continue;
        let ev;
        try { ev = JSON.parse(line.slice(5)); } catch { continue; }
        if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") { text += ev.delta.text; onText?.(ev.delta.text, text); }
        else if (ev.type === "message_delta") stop = ev.delta?.stop_reason ?? stop;
        else if (ev.type === "error") throw new Error(ev.error?.message || "The AI service returned an error.");
      }
    }
    return { text, stop };
  }

  // ---------- server capabilities (Netlify Functions) ----------
  let statusPromise = null;
  function serverStatus(force) {
    if (!statusPromise || force) {
      statusPromise = fetch("/api/status", { credentials: "same-origin", cache: "no-store" })
        .then((r) => (r.ok && (r.headers.get("content-type") || "").includes("json") ? r.json() : null))
        .catch(() => null)
        .then((s) => s || { server: false, ai: { configured: false }, connections: {}, google: { configured: false } });
    }
    return statusPromise;
  }

  // ---------- OpenAI-compatible streaming (FIZZ server proxy and OpenRouter) ----------
  async function streamOpenAI(url, headers, payload, signal, onText) {
    const res = await fetch(url, { method: "POST", signal, credentials: "same-origin", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(payload) }).catch((e) => {
      if (e.name === "AbortError") throw e;
      throw new Error("Couldn't reach the AI service. Check your internet connection.");
    });
    if (!res.ok) {
      let msg = `The AI service returned an error (${res.status}).`;
      try { const j = await res.json(); msg = j.error?.message || msg; } catch {}
      if (res.status === 404) msg = "FIZZ AI isn't available on this deployment. Connect OpenRouter or add an API key in Settings → AI.";
      if (res.status === 401 && url.includes("openrouter")) msg = "OpenRouter rejected your key. Reconnect it in Settings → AI.";
      const e = new Error(msg);
      e.status = res.status;
      throw e;
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "", text = "", stop = null;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n")) !== -1) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") continue;
        let ev;
        try { ev = JSON.parse(data); } catch { continue; }
        if (ev.error) throw new Error(ev.error.message || "The AI service returned an error.");
        const ch = ev.choices?.[0];
        const delta = ch?.delta?.content;
        if (delta) { text += delta; onText?.(delta, text); }
        if (ch?.finish_reason) stop = ch.finish_reason === "length" ? "max_tokens" : ch.finish_reason === "content_filter" ? "refusal" : "end_turn";
      }
    }
    return { text, stop };
  }

  function toOpenAI(m) {
    if (m.role === "assistant") return { role: "assistant", content: m.content };
    const parts = [];
    for (const a of m.attachments || []) {
      if (a.type === "image") parts.push({ type: "image_url", image_url: { url: `data:${a.mime};base64,${a.data}` } });
      else parts.push({ type: "text", text: `<attachment name="${a.name}">\n${a.text}\n</attachment>` });
    }
    parts.push({ type: "text", text: m.content || "(see attachments)" });
    return { role: "user", content: parts };
  }

  /** Streams a reply using the provider chosen in Settings → AI. */
  async function aiStream(settings, { system, messages, signal, onText, model }) {
    const history = messages.filter((m) => !m.error && (m.role === "user" || m.content));
    if (settings.provider === "anthropic") {
      if (!settings.apiKey) throw new Error("NO_KEY");
      return streamChat({ apiKey: settings.apiKey, model: model || settings.model, system, messages: history.map(toApiContent), signal, onText });
    }
    if (settings.provider === "openrouter") {
      if (!settings.openrouterKey) throw new Error("NO_KEY");
      return streamOpenAI("https://openrouter.ai/api/v1/chat/completions", { Authorization: `Bearer ${settings.openrouterKey}`, "X-Title": "FIZZ" }, { model: settings.openrouterModel || "z-ai/glm-4.6", stream: true, messages: [{ role: "system", content: system }, ...history.map(toOpenAI)] }, signal, onText);
    }
    return streamOpenAI("/api/ai/chat", {}, { system, messages: history.map(toOpenAI) }, signal, onText);
  }

  function providerLabel(settings, product = "chat") {
    if (settings.provider === "openrouter") return settings.openrouterModel || "OpenRouter";
    if (settings.provider === "anthropic") return (MODELS.find((m) => m.id === settings.model) || MODELS[0])[product];
    return product === "dev" ? "Fizz Code 1.0" : "FIZZ 1.0";
  }

  // ---------- OpenRouter OAuth (PKCE, fully in the browser) ----------
  const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  async function openrouterConnect() {
    const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
    const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
    sessionStorage.setItem("fizz.or.verifier", verifier);
    sessionStorage.setItem("fizz.or.return", location.pathname.split("/").pop() || "chat.html");
    const cb = new URL(location.pathname, location.origin);
    cb.searchParams.set("openrouter", "callback");
    location.href = `https://openrouter.ai/auth?callback_url=${encodeURIComponent(cb.toString())}&code_challenge=${challenge}&code_challenge_method=S256`;
  }
  /** Completes the OpenRouter redirect if this page load is the callback. Returns the new key or null. */
  async function openrouterFinish() {
    const u = new URL(location.href);
    const code = u.searchParams.get("code");
    if (u.searchParams.get("openrouter") !== "callback" || !code) return null;
    const verifier = sessionStorage.getItem("fizz.or.verifier");
    history.replaceState(null, "", u.pathname + u.hash);
    sessionStorage.removeItem("fizz.or.verifier");
    if (!verifier) throw new Error("The OpenRouter sign-in expired. Please try again.");
    const res = await fetch("https://openrouter.ai/api/v1/auth/keys", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code, code_verifier: verifier, code_challenge_method: "S256" }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.key) throw new Error(j.error?.message || "OpenRouter didn't return a key.");
    return j.key;
  }

  // ---------- attachments ----------
  async function readAttachment(file) {
    if (file.size > 5 * 1024 * 1024) throw new Error(`"${file.name}" is larger than 5 MB.`);
    if (/^image\/(png|jpeg|gif|webp)$/.test(file.type)) {
      const dataUrl = await new Promise((r, j) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.onerror = j; fr.readAsDataURL(file); });
      return { type: "image", name: file.name, mime: file.type, data: String(dataUrl).split(",")[1] };
    }
    const text = await file.text();
    if (text.includes("\u0000")) throw new Error(`"${file.name}" isn't a supported file. Use images, text or code files.`);
    return { type: "text", name: file.name, text: text.slice(0, 200000) };
  }
  function toApiContent(m) {
    if (m.role === "assistant") return { role: "assistant", content: m.content };
    const parts = [];
    for (const a of m.attachments || []) {
      if (a.type === "image") parts.push({ type: "image", source: { type: "base64", media_type: a.mime, data: a.data } });
      else parts.push({ type: "text", text: `<attachment name="${a.name}">\n${a.text}\n</attachment>` });
    }
    parts.push({ type: "text", text: m.content || "(see attachments)" });
    return { role: "user", content: parts };
  }

  // ---------- markdown ----------
  function markdown(text) {
    if (!window.marked || !window.DOMPurify) return esc(text).replace(/\n/g, "<br>");
    const html = marked.parse(text, { gfm: true });
    const clean = DOMPurify.sanitize(html, { FORBID_TAGS: ["style", "iframe", "form", "img"], FORBID_ATTR: ["style"] });
    return clean.replace(/<a /g, '<a target="_blank" rel="noopener noreferrer nofollow" ');
  }

  function toast(msg) {
    let t = document.getElementById("fizz-toast");
    if (!t) {
      t = document.createElement("div");
      t.id = "fizz-toast";
      t.className = "fizz-toast";
      t.setAttribute("role", "status");
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove("show"), 2800);
  }

  function download(name, content, type = "application/json") {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(content instanceof Blob ? content : new Blob([content], { type }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // ---------- in-page switch between FIZZ and FIZZ DEV (no reload) ----------
  const APP_PAGES = { chat: "chat.html", dev: "dev.html" };
  const appHooks = { chat: [], dev: [] };
  const app = {
    current: () => document.documentElement.dataset.app || "chat",
    onShow(name, fn) { appHooks[name].push(fn); },
    switch(name, payload, { push = true } = {}) {
      if (!APP_PAGES[name]) return;
      const root = document.documentElement;
      const same = app.current() === name;
      if (push && !same) {
        const hash = name === "chat" ? store.get("fizz.chat.last", "") : "";
        history.pushState({ app: name }, "", APP_PAGES[name] + (hash ? `#${hash}` : ""));
      }
      const apply = () => {
        root.dataset.app = name;
        document.querySelectorAll("[data-switch]").forEach((a) => a.classList.toggle("on", a.dataset.switch === name));
        appHooks[name].forEach((fn) => { try { fn(payload); } catch (e) { console.error(e); } });
      };
      if (same) return apply();
      const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (document.startViewTransition && !reduce) document.startViewTransition(apply);
      else apply();
    },
  };
  if (document.documentElement.dataset.app) {
    document.addEventListener("click", (e) => {
      const a = e.target.closest("a[data-switch]");
      if (!a || e.ctrlKey || e.metaKey || e.shiftKey || e.button) return;
      e.preventDefault();
      app.switch(a.dataset.switch);
    });
    document.addEventListener("DOMContentLoaded", () => document.querySelectorAll("[data-switch]").forEach((a) => a.classList.toggle("on", a.dataset.switch === app.current())));
    window.addEventListener("popstate", () => app.switch(/\/dev(\.html)?$/.test(location.pathname) ? "dev" : "chat", null, { push: false }));
    window.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === ".") { e.preventDefault(); app.switch(app.current() === "dev" ? "chat" : "dev"); }
    });
  }

  window.FIZZ = { app, serverStatus, aiStream, providerLabel, openrouterConnect, openrouterFinish, toOpenAI, store, esc, uid, theme, auth, loadData, saveData, MODELS, streamChat, readAttachment, toApiContent, markdown, toast, download, validEmail };
  theme.init();
})();
