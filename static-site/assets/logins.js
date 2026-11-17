/* Saved website logins (Settings → Connections → Website logins).
   Each login: { id, url, host, name, email, username, secret, at }. Only the address is required.
   The password is sealed by the FIZZ server for this user and this site the moment it is saved: the device keeps only
   the sealed text, and Fizz Code never sees the password. In the cloud browser, <fizz-browser action="login" account="…"/>
   asks the server to open it and type it into the login form, and only on the site it was saved for. */
(function () {
  "use strict";
  const F = window.FIZZ;
  const esc = F.esc;
  const data = () => F.loadData(F.auth.current());
  const save = () => { try { F.saveData(F.auth.current(), data()); } catch (e) { console.error("[logins]", e); } };
  const hostOf = (u) => { try { return new URL(/^https?:\/\//i.test(u) ? u : `https://${u}`).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; } };
  const list = () => (Array.isArray(data().settings.logins) ? data().settings.logins : []);

  /** The login a tool asks for: its id, its site (host or address), or its name. */
  function find(query) {
    const q = String(query || "").trim().toLowerCase();
    if (!q) return null;
    const h = hostOf(q);
    return list().find((l) => l.id === q) || list().find((l) => h && (l.host === h || h.endsWith(`.${l.host}`) || l.host.endsWith(`.${h}`))) || list().find((l) => (l.name || "").toLowerCase() === q) || null;
  }

  async function add({ url, name, email, username, password }) {
    const host = hostOf(url);
    if (!host || !host.includes(".")) throw new Error("Enter the site's address, like https://example.com.");
    let secret = "";
    if (password) secret = (await F.conn.api("/api/browser", { body: { action: "seal-login", url, password }, auth: true })).secret;
    const all = list().filter((l) => l.host !== host);
    const login = { id: F.uid(), url: /^https?:\/\//i.test(url) ? url : `https://${url}`, host, name: String(name || "").trim().slice(0, 80) || host, email: String(email || "").trim().slice(0, 200), username: String(username || "").trim().slice(0, 200), secret, at: Date.now() };
    data().settings.logins = [login, ...all].slice(0, 200);
    save();
    return login;
  }
  function remove(id) { data().settings.logins = list().filter((l) => l.id !== id); save(); }

  /** For Fizz Code's prompt: what is saved (never a password). */
  function promptText() {
    const all = list();
    if (!all.length) return "";
    return [
      "SAVED WEBSITE LOGINS (Settings → Connections → Website logins). You CAN sign in to these sites: never say you can't or that you have no details.",
      ...all.map((l) => `- ${l.name} — ${l.host}${l.email ? ` · email ${l.email}` : ""}${l.username ? ` · username ${l.username}` : ""} · password ${l.secret ? "saved" : "not saved"}`),
      'To sign in: open the site\'s login page in the cloud browser, then <fizz-browser action="login" account="site host"/>: FIZZ types the saved email/username and password into the form itself (you never see the password), then you press the sign-in button. On a two-step login (email first, password on the next page) use action="login" on each step.',
      'If the site sends a code by email: with Gmail connected, search it (<fizz-google app="gmail" action="search" q="from:SITE newer_than:1h"/>), read the newest message, and type the code into the site. Without Gmail, ask the user for the code.',
      "A login with no password saved: fill what is saved and hand over the password step to the user (action=\"handoff\").",
    ].join("\n");
  }

  // ---------- Settings ----------
  const logo = (l) => F.logoImg(l.name || l.host, F.faviconUrls(l.host));
  function html() {
    const rows = list().map((l) => `<div class="conn login-row">${logo(l)}<div class="conn-body"><b>${esc(l.name)}</b><small>${esc(l.host)}${l.email ? ` · ${esc(l.email)}` : ""}${l.username ? ` · ${esc(l.username)}` : ""}</small><small class="conn-state">${l.secret ? "Password saved (sealed — Fizz Code never sees it)" : "No password saved"}</small></div><button type="button" class="btn btn-outline btn-sm" data-login-del="${esc(l.id)}">Remove</button></div>`).join("");
    return `<h3 class="conn-group">Website logins</h3><p class="muted-sm">Sites you have an account on. Fizz Code signs in to them in the cloud browser by itself; the password is sealed by the FIZZ server and typed straight into the site's own login form, never shown to the AI.</p>
      ${rows || '<p class="muted-sm">No saved logins yet.</p>'}
      <div class="login-add">
        <div class="login-grid">
          <label class="field"><span>Site address *</span><input class="input" data-login="url" placeholder="https://example.com/login" autocomplete="off" spellcheck="false" /></label>
          <label class="field"><span>Name</span><input class="input" data-login="name" placeholder="Shown in FIZZ (optional)" autocomplete="off" /></label>
          <label class="field"><span>Email</span><input class="input" data-login="email" type="email" placeholder="Optional" autocomplete="off" /></label>
          <label class="field"><span>Username</span><input class="input" data-login="username" placeholder="Optional" autocomplete="off" /></label>
          <label class="field"><span>Password</span><input class="input" data-login="password" type="password" placeholder="Optional" autocomplete="new-password" /></label>
        </div>
        <div class="login-preview" data-login-preview></div>
        <button type="button" class="btn btn-sm" data-login-add>Save login</button>
      </div>`;
  }
  function mount(box) {
    if (!box) return;
    box.innerHTML = html();
    const url = box.querySelector('[data-login="url"]');
    const preview = box.querySelector("[data-login-preview]");
    // The site's icon shows as soon as the address is typed.
    url.addEventListener("input", () => { const h = hostOf(url.value); preview.innerHTML = h && h.includes(".") ? `${F.logoImg(h, F.faviconUrls(h))}<span>${esc(h)}</span>` : ""; });
    box.addEventListener("click", async (e) => {
      const del = e.target.closest("[data-login-del]");
      if (del) { remove(del.dataset.loginDel); mount(box); F.toast("Login removed"); return; }
      const btn = e.target.closest("[data-login-add]");
      if (!btn) return;
      const v = (k) => box.querySelector(`[data-login="${k}"]`).value;
      btn.disabled = true;
      try {
        const l = await add({ url: v("url"), name: v("name"), email: v("email"), username: v("username"), password: v("password") });
        mount(box);
        F.toast(`Saved the login for ${l.name}`);
      } catch (err) { F.toast(err.message); btn.disabled = false; }
    });
  }

  F.logins = { list, find, add, remove, promptText, mount, hostOf };
})();
