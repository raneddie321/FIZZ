/* Public site: header/footer, icons, theme switch, auth pages, contact form. */
(function () {
  "use strict";
  const { esc, auth, theme, toast } = window.FIZZ;

  const ICON_PATHS = {
    arrow: "M5 12h14M13 6l6 6-6 6",
    chat: "M21 12a8 8 0 0 1-11.7 7.1L4 20l1-4.6A8 8 0 1 1 21 12z",
    file: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h6",
    pen: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z",
    code: "M16 18l6-6-6-6M8 6l-6 6 6 6",
    layout: "M3 3h18v18H3zM3 9h18M9 21V9",
    terminal: "M4 17l6-6-6-6M12 19h8",
    folder: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
    globe: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18",
    image: "M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6M15 9h.01",
    shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
    lock: "M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4",
    wallet: "M3 7h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 7l2-3h12M16 13h.01",
    spark: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z",
    bulb: "M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z",
    search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4",
    brain: "M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 0V7a3 3 0 0 0-3-3zM15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 0",
    clip: "M21 11l-8.5 8.5a5 5 0 0 1-7-7L14 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L15 7",
    history: "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 3",
    keyboard: "M3 6h18v12H3zM7 10h.01M11 10h.01M15 10h.01M7 14h10",
    eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
    bot: "M12 3v3M5 8h14v11H5zM9 13h.01M15 13h.01M9 17h6",
    git: "M6 3v12M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 9a9 9 0 0 1-9 9",
    cart: "M3 4h2l2.5 11h11L21 7H7M9 20h.01M18 20h.01",
    devices: "M3 5h13v10H3zM7 19h5M18 9h3v10h-3z",
    menu: "M4 7h16M4 12h16M4 17h16",
    x: "M6 6l12 12M18 6L6 18",
    check: "M5 12l5 5 9-10",
    test: "M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3",
  };
  const icon = (name, cls = "i") => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICON_PATHS[name] || ""}"/></svg>`;
  const MARK = (dev) => `<img class="mark" src="assets/mark-fizz${dev ? "-dev" : ""}.png" alt="" aria-hidden="true" />`;
  const WORDMARK = (dev) => `<span class="wordmark"><img class="logo-img" src="assets/logo-fizz${dev ? "-dev" : ""}.png" alt="${dev ? "fizz dev" : "fizz"}" /></span>`;

  const NAV = [
    ["fizz.html", "FIZZ"],
    ["fizz-dev.html", "FIZZ DEV"],
    ["pricing.html", "Pricing"],
    ["faq.html", "FAQ"],
    ["contact.html", "Support"],
  ];
  const page = location.pathname.split("/").pop() || "index.html";

  function header() {
    const me = auth.current();
    const nav = NAV.map(([h, l]) => `<a href="${h}" ${page === h ? 'aria-current="page"' : ""}>${l}</a>`).join("");
    const actions = me
      ? `<a class="btn btn-sm" href="chat.html">Open FIZZ</a>`
      : `<a class="btn btn-ghost btn-sm hide-sm" href="signin.html">Sign in</a><a class="btn btn-sm" href="signin.html#signup">Get started</a>`;
    return `<div class="inner"><a href="index.html" aria-label="FIZZ home" style="text-decoration:none">${WORDMARK(false)}</a>
      <nav class="site-nav" aria-label="Main">${nav}</nav>
      <div class="header-actions">${actions}<button class="icon-btn mobile-toggle" aria-label="Menu" aria-expanded="false">${icon("menu")}</button></div></div>
      <nav class="mobile-nav" aria-label="Mobile">${NAV.map(([h, l]) => `<a href="${h}">${l}</a>`).join("")}${me ? "" : '<a href="signin.html">Sign in</a>'}</nav>`;
  }

  function footer() {
    const col = (t, links) => `<div><h4>${t}</h4><ul>${links.map(([h, l]) => `<li><a href="${h}">${l}</a></li>`).join("")}</ul></div>`;
    const t = theme.get();
    return `<div class="cols"><div>${WORDMARK(false)}<p style="color:var(--muted);font-size:14px;max-width:260px">AI assistance for everyday work, and an AI workspace for building software.</p>
      <div class="theme-switch" role="group" aria-label="Theme">${["light", "dark", "system"].map((v) => `<button data-theme="${v}" aria-pressed="${t === v}">${v[0].toUpperCase() + v.slice(1)}</button>`).join("")}</div></div>
      ${col("Products", [["fizz.html", "FIZZ"], ["fizz-dev.html", "FIZZ DEV"], ["pricing.html", "Pricing"]])}
      ${col("Resources", [["product.html", "Overview"], ["faq.html", "FAQ"], ["contact.html", "Contact support"]])}
      ${col("Legal", [["terms.html", "Terms of Service"], ["privacy.html", "Privacy Policy"]])}</div>
      <div class="bottom"><div><span><span class="raneddie">RANEDDIE</span> &nbsp;© ${new Date().getFullYear()} RANEDDIE. All rights reserved.</span><span>FIZZ and FIZZ DEV are products of RANEDDIE.</span></div></div>`;
  }

  function mount() {
    document.querySelectorAll("[data-icon]").forEach((el) => (el.outerHTML = icon(el.dataset.icon, el.className || "i")));
    document.querySelectorAll("[data-mark]").forEach((el) => (el.outerHTML = MARK(el.dataset.mark === "dev")));
    const h = document.querySelector("header[data-site]");
    if (h) {
      h.className = "site-header";
      h.innerHTML = header();
      h.querySelector(".mobile-toggle").addEventListener("click", (e) => {
        const open = h.classList.toggle("open");
        e.currentTarget.setAttribute("aria-expanded", open);
      });
    }
    const f = document.querySelector("footer[data-site]");
    if (f) {
      f.className = "site-footer";
      f.innerHTML = footer();
      f.addEventListener("click", (e) => {
        const b = e.target.closest("[data-theme]");
        if (!b) return;
        theme.set(b.dataset.theme);
        f.querySelectorAll("[data-theme]").forEach((x) => x.setAttribute("aria-pressed", x === b));
      });
    }
    initAuth();
    initContact();
  }

  // ---------- auth page ----------
  function safeNext() {
    const n = new URLSearchParams(location.search).get("next") || "chat.html";
    return /^[a-z0-9-]+\.html(#.*)?$/i.test(n) ? n : "chat.html";
  }
  function initAuth() {
    const root = document.getElementById("auth-root");
    if (!root) return;
    if (auth.current()) return location.replace(safeNext());
    const views = { signin: root.querySelector("#v-signin"), signup: root.querySelector("#v-signup"), reset: root.querySelector("#v-reset") };
    const show = (v) => {
      Object.entries(views).forEach(([k, el]) => el.classList.toggle("hidden", k !== v));
      document.title = { signin: "Sign in", signup: "Create your RANEDDIE ID", reset: "Reset your account" }[v] + " · FIZZ";
      views[v].querySelector("input")?.focus();
    };
    const fromHash = () => show(["signup", "reset"].includes(location.hash.slice(1)) ? location.hash.slice(1) : "signin");
    window.addEventListener("hashchange", fromHash);
    fromHash();

    root.querySelectorAll(".pw-toggle").forEach((b) =>
      b.addEventListener("click", () => {
        const i = b.previousElementSibling;
        i.type = i.type === "password" ? "text" : "password";
        b.textContent = i.type === "password" ? "Show" : "Hide";
      }),
    );
    const setErr = (form, field, msg) => {
      form.querySelectorAll(".err").forEach((e) => (e.textContent = ""));
      form.querySelectorAll("[aria-invalid]").forEach((e) => e.removeAttribute("aria-invalid"));
      const slot = form.querySelector(`[data-err="${field}"]`) || form.querySelector('[data-err="form"]');
      if (slot) slot.textContent = msg || "";
      const input = form.querySelector(`[name="${field}"]`);
      if (input && msg) { input.setAttribute("aria-invalid", "true"); input.focus(); }
    };
    const busy = (form, on, label) => {
      const b = form.querySelector("button[type=submit]");
      b.disabled = on;
      b.textContent = on ? "Please wait…" : label;
    };

    root.addEventListener("input", (e) => {
      const f = e.target.closest("form");
      if (!f || !e.target.name) return;
      e.target.removeAttribute("aria-invalid");
      const slot = f.querySelector(`[data-err="${e.target.name}"]`);
      if (slot) slot.textContent = "";
    });
    views.signin.querySelector("form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.target;
      busy(f, true, "Sign in");
      const r = await auth.signIn({ email: f.email.value, password: f.password.value, remember: f.remember.checked });
      busy(f, false, "Sign in");
      if (r.error) return setErr(f, "form", r.error);
      location.replace(safeNext());
    });
    views.signup.querySelector("form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.target;
      busy(f, true, "Create account");
      const r = await auth.signUp({ name: f.name.value, email: f.email.value, password: f.password.value, confirm: f.confirm.value, terms: f.terms.checked });
      busy(f, false, "Create account");
      if (r.error) return setErr(f, r.field, r.error);
      location.replace(safeNext());
    });
    views.reset.querySelector("form").addEventListener("submit", (e) => {
      e.preventDefault();
      const f = e.target;
      if (!f.confirm.checked) return setErr(f, "form", "Tick the box to confirm.");
      if (auth.resetLocal(f.email.value)) {
        toast("Account removed from this browser. You can create it again.");
        f.reset();
        location.hash = "signup";
      } else setErr(f, "email", "There's no account with that email in this browser.");
    });
  }

  // ---------- contact form (Netlify Forms) ----------
  function initContact() {
    const form = document.getElementById("contact-form");
    if (!form) return;
    const me = auth.current();
    if (me) { form.name.value = me.name; form.email.value = me.email; }
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const status = document.getElementById("contact-status");
      if (!FIZZ.validEmail(form.email.value.trim())) { status.className = "alert alert-error"; status.innerHTML = "<p>Enter a valid email address.</p>"; return; }
      const btn = form.querySelector("button[type=submit]");
      btn.disabled = true;
      btn.textContent = "Sending…";
      try {
        const res = await fetch("/", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(new FormData(form)).toString() });
        if (!res.ok) throw new Error(String(res.status));
        form.classList.add("hidden");
        status.className = "alert alert-success";
        status.innerHTML = "<div><strong>Thanks — we received your message.</strong><p>We'll reply to the email address you provided.</p></div>";
      } catch {
        status.className = "alert alert-error";
        status.innerHTML = `<p>We couldn't send your message right now. Please try again in a few minutes.</p>`;
      } finally {
        btn.disabled = false;
        btn.textContent = "Send message";
      }
    });
  }

  window.FIZZ.icon = icon;
  window.FIZZ.MARK = MARK;
  window.FIZZ.WORDMARK = WORDMARK;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
