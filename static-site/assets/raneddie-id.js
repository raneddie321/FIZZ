/* RanEddie ID (Clerk) in the browser: loads clerk-js, keeps the signed-in user in sync with this
   page, and saves a few small FIZZ settings to the account (privateMetadata.fizz, via /api/account).
   Signing in is optional: without it FIZZ works as a guest. */
(function () {
  "use strict";
  const F = window.FIZZ;
  // Pinned clerk-js (Core 3, the same major as @clerk/nextjs v7 used by RanEddie ID). Change deliberately.
  const CLERK_JS_VERSION = "6.34.1";
  const SYNC_FIELDS = ["theme", "style", "provider", "model", "orModel", "devMode"];

  /** Frontend API host encoded in the publishable key (pk_test_<base64 host$>). */
  function frontendApi(pk) {
    try { return atob(pk.split("_")[2]).replace(/\$$/, ""); } catch { return null; }
  }

  let loading = null;
  /** Loads clerk-js once. Resolves to the Clerk instance, or null when RanEddie ID isn't set up here. */
  function load() {
    loading ||= (async () => {
      const st = await F.serverStatus();
      const pk = st.raneddieId?.publishableKey;
      const host = pk && frontendApi(pk);
      if (!host || !/^[a-z0-9.-]+$/i.test(host)) return null;
      if (!window.Clerk) {
        await new Promise((resolve, reject) => {
          const s = document.createElement("script");
          s.src = `https://${host}/npm/@clerk/clerk-js@${CLERK_JS_VERSION}/dist/clerk.browser.js`;
          s.async = true;
          s.crossOrigin = "anonymous";
          s.dataset.clerkPublishableKey = pk;
          s.onload = resolve;
          s.onerror = () => reject(new Error("RanEddie ID couldn't be loaded. Check your connection."));
          document.head.appendChild(s);
        });
      }
      await window.Clerk.load();
      return window.Clerk;
    })().catch((e) => { console.warn("[RanEddie ID]", e); loading = null; return null; });
    return loading;
  }

  /** The small, non-secret profile FIZZ keeps in localStorage so pages can render before Clerk loads. */
  function profile(u) {
    if (!u) return null;
    const email = u.primaryEmailAddress?.emailAddress || "";
    const name = u.username || [u.firstName, u.lastName].filter(Boolean).join(" ") || email.split("@")[0] || "RanEddie ID";
    return { id: u.id, name, email, username: u.username || "", imageUrl: u.hasImage ? u.imageUrl : "" };
  }

  /** Makes this page agree with Clerk's session. Reloads the apps when the user changed. */
  async function reconcile() {
    const clerk = await load();
    if (!clerk) return null;
    const now = profile(clerk.user);
    const was = F.auth.rid();
    F.auth.setRid(now);
    if ((now?.id || null) !== (was?.id || null)) {
      if (document.documentElement.dataset.app) { location.reload(); return null; }
      document.dispatchEvent(new CustomEvent("fizz:account"));
    }
    return now;
  }

  async function signOut() {
    const clerk = await load();
    try { await clerk?.signOut(); } catch (e) { console.warn(e); }
    F.auth.setRid(null);
    F.store.set("fizz.rid.signedOut", Date.now());
    location.reload();
  }

  // ---------- settings sync (privateMetadata.fizz, at most ~500 bytes on the server) ----------
  async function api(method, body) {
    const clerk = await load();
    const token = await clerk?.session?.getToken();
    if (!token) throw new Error("signed_out");
    const res = await fetch("/api/account", { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body && JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error?.message || `Error ${res.status}`), { status: res.status });
    return data;
  }
  const pick = (settings) => ({
    theme: F.theme.get(), style: settings.style, provider: settings.provider, model: settings.model,
    orModel: settings.openrouterModel, devMode: settings.devMode || "build",
  });
  const same = (a, b) => SYNC_FIELDS.every((k) => (a?.[k] ?? null) === (b?.[k] ?? null));
  const syncedKey = (u) => `fizz.rid.synced.${u.rid.id}`;

  let timer = null;
  function queuePush(user, data) {
    if (!user?.rid) return;
    const next = pick(data.settings);
    if (same(next, F.store.get(syncedKey(user), null))) return;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const value = { ...next, at: Date.now() };
      try {
        await api("PUT", { fizz: value });
        F.store.set(syncedKey(user), value);
      } catch (e) {
        if (e.status === 507 || e.status === 413) F.toast(e.message);
        else if (e.status !== 503) console.warn("[RanEddie ID] settings not saved", e);
      }
    }, 1500);
  }

  /** Applies settings saved in the account when they are newer than this browser's copy. */
  async function pull(user) {
    let remote;
    try { remote = (await api("GET")).fizz; } catch (e) { if (e.status !== 503) console.warn("[RanEddie ID]", e); return; }
    const data = F.loadData(user);
    const local = F.store.get(syncedKey(user), null);
    if (!remote) return queuePush(user, data);
    if (local && local.at >= remote.at) return queuePush(user, data);
    const s = data.settings;
    if (remote.style) s.style = remote.style;
    if (remote.provider) s.provider = remote.provider;
    if (remote.model) s.model = remote.model;
    if (remote.orModel) s.openrouterModel = remote.orModel;
    if (remote.devMode) s.devMode = remote.devMode;
    if (remote.theme) F.theme.set(remote.theme);
    F.store.set(syncedKey(user), remote);
    saveData(user, data);
    window.dispatchEvent(new CustomEvent("fizz:settings"));
  }

  // Every save in FIZZ / FIZZ DEV also queues the small settings for the account (only if they changed).
  const saveData = F.saveData;
  F.saveData = (user, data) => { const r = saveData(user, data); queuePush(user, data); return r; };

  // ---------- account UI shared by FIZZ and FIZZ DEV ----------
  const INVITE_KEY = "fizz.rid.inviteHidden";
  const initials = (n) => String(n || "?").split(/\s+/).map((x) => x[0]).slice(0, 2).join("").toUpperCase();
  /** Fills the sidebar account button and shows a gentle sign-in invite to guests. */
  function renderMe(root, user) {
    root.querySelector("#me-name").textContent = user.guest ? "Guest" : user.name;
    const av = root.querySelector("#me-avatar");
    av.innerHTML = user.rid?.imageUrl ? `<img src="${F.esc(user.rid.imageUrl)}" alt="" />` : F.esc(user.guest ? "?" : initials(user.name));
    const sub = root.querySelector("#me-sub");
    sub.textContent = user.rid ? "RanEddie ID" : user.legacy ? "Saved in this browser" : "Sign in with RanEddie ID";
    sub.classList.toggle("rid-cta", !user.rid);
    const foot = root.querySelector(".side-foot");
    root.querySelector(".rid-invite")?.remove();
    const hiddenAt = F.store.get(INVITE_KEY, 0);
    if (!user.rid && !user.guest && foot && Date.now() - hiddenAt > 14 * 86400000) {
      foot.insertAdjacentHTML("beforebegin", `<div class="rid-invite"><button type="button" class="x" data-rid-hide aria-label="Hide">✕</button>
        <p><b>Keep your settings everywhere</b>Sign in with your RanEddie ID — one account for FIZZ and RanEddie games. Your chats and projects stay in this browser.</p>
        <a class="btn btn-sm rid-signin-btn" href="${F.esc(F.auth.url())}"><img src="assets/raneddie-logo.png" alt="" />Sign in with RanEddie ID</a></div>`);
      root.querySelector("[data-rid-hide]").onclick = () => { F.store.set(INVITE_KEY, Date.now()); root.querySelector(".rid-invite")?.remove(); };
    }
  }
  /** First and last items of the account menu. */
  const menuHead = (user) => user.rid ? [{ label: user.email || user.name }]
    : user.legacy ? [{ label: `${user.email} · this browser` }, { k: "rid-signin", html: "Sign in with RanEddie ID" }]
    : [{ label: "Not signed in" }, { k: "rid-signin", html: "Sign in with RanEddie ID" }, { k: "rid-signup", html: "Create a RanEddie ID" }];
  const menuTail = (user) => (user.guest ? [] : ["-", { k: "signout", html: "Sign out" }]);
  function onMenu(k) {
    if (k === "rid-signin") location.href = F.auth.url("signin");
    if (k === "rid-signup") location.href = F.auth.url("signup");
    if (k === "signout") F.auth.signOut();
  }

  F.rid = { load, reconcile, signOut, profile, version: CLERK_JS_VERSION, renderMe, menuHead, menuTail, onMenu };

  // The sign-in page drives Clerk itself; everywhere else, check the session in the background.
  if (!document.getElementById("rid-card")) {
    const start = async () => {
      const u = await reconcile();
      if (u && document.documentElement.dataset.app) pull(F.auth.current());
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
  }
})();
