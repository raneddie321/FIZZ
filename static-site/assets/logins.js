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

  // ---------- payment cards ----------
  const cards = () => (Array.isArray(data().settings.cards) ? data().settings.cards : []);
  function findCard(query) {
    const q = String(query || "").trim().toLowerCase().replace(/[•*\s]/g, "");
    const all = cards();
    if (!q) return all.length === 1 ? all[0] : null;
    return all.find((c) => c.id === q) || all.find((c) => c.last4 === q.slice(-4)) || all.find((c) => (c.label || "").toLowerCase().replace(/\s/g, "") === q) || all.find((c) => c.brand.toLowerCase() === q) || null;
  }
  async function addCard({ label, number, month, year, cvc, name, zip }) {
    const r = await F.conn.api("/api/browser", { body: { action: "seal-card", number, month, year, cvc, name, zip }, auth: true });
    const c = { id: F.uid(), label: String(label || "").trim().slice(0, 60) || `${r.brand} •••• ${r.last4}`, brand: r.brand, last4: r.last4, exp: r.exp, secret: r.secret, at: Date.now() };
    data().settings.cards = [c, ...cards().filter((x) => !(x.last4 === c.last4 && x.brand === c.brand))].slice(0, 20);
    save();
    return c;
  }
  function removeCard(id) { data().settings.cards = cards().filter((c) => c.id !== id); save(); }
  const cardName = (c) => `${c.label}${c.label.includes(c.last4) ? "" : ` (${c.brand} •••• ${c.last4})`}`;

  /** For Fizz Code's prompt: what is saved (never a password). */
  function promptText() {
    const all = list();
    const pay = cards().length ? [
      "SAVED PAYMENT CARDS (Settings → Connections → Payment cards). You CAN pay on websites with these when the user asks you to buy something:",
      ...cards().map((c) => `- ${cardName(c)}, expires ${c.exp}`),
      'To pay: fill everything else in the checkout yourself (cart, shipping, contact details; ask with <fizz-ask> for what you don\'t know), go to the payment step, then <fizz-browser action="pay" card="last 4 digits" amount="the total as shown"/>. The user approves it with one click in the chat; FIZZ then types the card into the payment form itself (you never see the card). Then press the pay / place order button.',
      "Never pay for something the user didn't ask to buy, and never on a site they didn't ask for.",
    ].join("\n") : "";
    if (!all.length) return pay;
    return [pay,
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
  function cardsHtml() {
    const rows = cards().map((c) => `<div class="conn login-row"><span class="app-ic card-ic" aria-hidden="true">${esc(c.brand.slice(0, 4))}</span><div class="conn-body"><b>${esc(c.label)}</b><small>${esc(c.brand)} •••• ${esc(c.last4)} · expires ${esc(c.exp)}</small><small class="conn-state">Sealed — Fizz Code never sees the card. Each payment needs your OK in the chat.</small></div><button type="button" class="btn btn-outline btn-sm" data-card-del="${esc(c.id)}">Remove</button></div>`).join("");
    return `<h3 class="conn-group">Payment cards</h3><p class="muted-sm">Cards Fizz Code can pay with when you ask it to buy something. The card is sealed by the FIZZ server the moment you save it; for each payment you approve the site and the amount in the chat, and FIZZ types the card straight into that site's payment form — the AI never sees it.</p>
      ${rows || '<p class="muted-sm">No saved cards yet.</p>'}
      <div class="login-add">
        <div class="login-grid">
          <label class="field"><span>Card number *</span><input class="input" data-card="number" inputmode="numeric" autocomplete="off" placeholder="1234 5678 9012 3456" /></label>
          <label class="field"><span>Expiry month *</span><input class="input" data-card="month" inputmode="numeric" autocomplete="off" placeholder="MM" maxlength="2" /></label>
          <label class="field"><span>Expiry year *</span><input class="input" data-card="year" inputmode="numeric" autocomplete="off" placeholder="YYYY" maxlength="4" /></label>
          <label class="field"><span>Security code (CVV)</span><input class="input" data-card="cvc" type="password" inputmode="numeric" autocomplete="off" placeholder="Optional" maxlength="4" /></label>
          <label class="field"><span>Name on card</span><input class="input" data-card="name" autocomplete="off" placeholder="Optional" /></label>
          <label class="field"><span>Postal code</span><input class="input" data-card="zip" autocomplete="off" placeholder="Optional" /></label>
          <label class="field"><span>Label</span><input class="input" data-card="label" autocomplete="off" placeholder="e.g. Personal Visa (optional)" /></label>
        </div>
        <button type="button" class="btn btn-sm" data-card-add>Save card</button>
      </div>`;
  }
  function mount(box) {
    if (!box) return;
    box.innerHTML = html() + cardsHtml();
    const url = box.querySelector('[data-login="url"]');
    const preview = box.querySelector("[data-login-preview]");
    // The site's icon shows as soon as the address is typed.
    url.addEventListener("input", () => { const h = hostOf(url.value); preview.innerHTML = h && h.includes(".") ? `${F.logoImg(h, F.faviconUrls(h))}<span>${esc(h)}</span>` : ""; });
    box.addEventListener("click", async (e) => {
      const cdel = e.target.closest("[data-card-del]");
      if (cdel) { removeCard(cdel.dataset.cardDel); mount(box); F.toast("Card removed"); return; }
      const cadd = e.target.closest("[data-card-add]");
      if (cadd) {
        const v = (k) => box.querySelector(`[data-card="${k}"]`).value;
        cadd.disabled = true;
        try { const c = await addCard({ number: v("number"), month: v("month"), year: v("year"), cvc: v("cvc"), name: v("name"), zip: v("zip"), label: v("label") }); mount(box); F.toast(`Saved ${c.brand} •••• ${c.last4}`); }
        catch (err) { F.toast(err.message); cadd.disabled = false; }
        return;
      }
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

  F.logins = { list, find, add, remove, promptText, mount, hostOf, cards, findCard, addCard, removeCard, cardName };
})();
