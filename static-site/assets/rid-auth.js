/* RanEddie ID sign-in, sign-up and password reset for FIZZ (signin.html).
   The same steps as the RanEddie ID site (raneddie-id/app/sign-in, sign-up, forgot-password),
   built on clerk-js so every RanEddie product shares one account. */
(function () {
  "use strict";
  const F = window.FIZZ;
  const { esc } = F;
  const card = document.getElementById("rid-card");
  if (!card) return;

  // ---------- helpers (ported from raneddie-id/lib/auth-helpers.ts) ----------
  const MIN_AGE = 13;
  const FRIENDLY = {
    form_identifier_not_found: "We couldn't find a RanEddie ID with that email.",
    form_password_incorrect: "That password isn't right. Try again or reset it.",
    form_identifier_exists: "That email already has a RanEddie ID. Sign in instead.",
    form_username_exists: "That username is taken. Try another one.",
    form_password_pwned: "This password has appeared in a data leak on another site. Please choose a different one.",
    form_code_incorrect: "That code isn't right. Check the email and try again.",
    verification_expired: "That code has expired. Send a new one.",
    too_many_requests: "Too many attempts. Please wait a minute and try again.",
  };
  function clerkError(error) {
    const e = error || {};
    const first = e.errors?.[0];
    const code = first?.code || e.code || "unknown";
    return { code, message: FRIENDLY[code] || first?.longMessage || first?.message || e.longMessage || e.message || "Something went wrong. Please try again.", param: first?.meta?.paramName };
  }
  const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim());
  // The only rule is 8+ characters (Clerk enforces its own on top); the meter suggests the rest.
  const passwordChecks = (pw) => [{ ok: pw.length >= 8, label: "At least 8 characters" }];
  function passwordStrength(pw) {
    if (!pw) return { score: 0, label: "" };
    let s = 0;
    if (pw.length >= 8) s++;
    if (pw.length >= 12) s++;
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
    if (/\d/.test(pw)) s++;
    if (/[^A-Za-z0-9]/.test(pw)) s++;
    const score = Math.min(4, Math.max(1, s - (pw.length < 8 ? 1 : 0)));
    return { score, label: ["", "Weak", "Fair", "Good", "Strong"][score] };
  }
  function usernameError(u) {
    if (u.length < 4) return "Use at least 4 characters.";
    if (u.length > 20) return "Use 20 characters or fewer.";
    if (!/^[A-Za-z]/.test(u)) return "Start with a letter.";
    if (!/^[A-Za-z0-9_-]+$/.test(u)) return "Use only letters, numbers, _ and -.";
    return null;
  }
  function ageOn(birth, today = new Date()) {
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age;
  }
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const daysInMonth = (y, m) => new Date(y || 2000, m + 1, 0).getDate();
  const CODES = "AF AX AL DZ AS AD AO AI AQ AG AR AM AW AU AT AZ BS BH BD BB BY BE BZ BJ BM BT BO BQ BA BW BV BR IO BN BG BF BI CV KH CM CA KY CF TD CL CN CX CC CO KM CG CD CK CR CI HR CU CW CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FK FO FJ FI FR GF PF TF GA GM GE DE GH GI GR GL GD GP GU GT GG GN GW GY HT HM VA HN HK HU IS IN ID IR IQ IE IM IL IT JM JP JE JO KZ KE KI KP KR KW KG LA LV LB LS LR LY LI LT LU MO MG MW MY MV ML MT MH MQ MR MU YT MX FM MD MC MN ME MS MA MZ MM NA NR NP NL NC NZ NI NE NG NU NF MK MP NO OM PK PW PS PA PG PY PE PH PN PL PT PR QA RE RO RU RW BL SH KN LC MF PM VC WS SM ST SA SN RS SC SL SG SX SK SI SB SO ZA GS SS ES LK SD SR SJ SE CH SY TW TJ TZ TH TL TG TK TO TT TN TR TM TC TV UG UA AE GB US UM UY UZ VU VE VN VG VI WF EH YE ZM ZW".split(" ");
  const flag = (c) => String.fromCodePoint(...[...c].map((x) => 0x1f1e6 + x.charCodeAt(0) - 65));
  function countries() {
    let names;
    try { names = new Intl.DisplayNames(["en"], { type: "region" }); } catch { names = { of: (c) => c }; }
    return CODES.map((code) => ({ code, name: names.of(code) ?? code, flag: flag(code) })).sort((a, b) => a.name.localeCompare(b.name));
  }
  function guessCountry() {
    for (const l of navigator.languages ?? [navigator.language]) {
      const region = (l || "").split("-")[1];
      if (region && region.length === 2 && CODES.includes(region.toUpperCase())) return region.toUpperCase();
    }
    return "";
  }

  // ---------- where to go afterwards ----------
  const params = new URLSearchParams(location.search);
  function safeRedirect(r) {
    return r && r.startsWith("/") && !r.startsWith("//") && !r.startsWith("/\\") ? r : null;
  }
  const legacyNext = params.get("next");
  const redirect = safeRedirect(params.get("redirect_url")) || (legacyNext && /^[a-z0-9-]+\.html(#.*)?$/i.test(legacyNext) ? `/${legacyNext}` : null);
  const target = () => redirect || "/chat.html";
  const withRedirect = (mode, extra = "") => `signin.html?mode=${mode}${redirect ? `&redirect_url=${encodeURIComponent(redirect)}` : ""}${extra}`;
  function modeFromUrl() {
    const m = params.get("mode") || location.hash.slice(1);
    return m === "signup" ? "signup" : m === "forgot" || m === "reset" ? "forgot" : "signin";
  }

  // ---------- markup (mirrors raneddie-id/components/ui.tsx) ----------
  const ICON = {
    back: '<svg viewBox="0 0 24 24" class="rid-i" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>',
    mail: '<svg viewBox="0 0 24 24" class="rid-i" aria-hidden="true"><path d="M3 6h18v12H3zM3 7l9 6 9-6"/></svg>',
    lock: '<svg viewBox="0 0 24 24" class="rid-i" aria-hidden="true"><path d="M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4"/></svg>',
    shield: '<svg viewBox="0 0 24 24" class="rid-i" aria-hidden="true"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/></svg>',
    check: '<svg viewBox="0 0 24 24" class="rid-i" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    alert: '<svg viewBox="0 0 24 24" class="rid-i" aria-hidden="true"><path d="M12 8v5M12 16h.01M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z"/></svg>',
    eye: '<svg viewBox="0 0 24 24" class="rid-i" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/></svg>',
  };
  const spinner = '<span class="rid-spin" aria-hidden="true"></span>';
  const heading = (title, sub) => `<div class="rid-head"><h1>${esc(title)}</h1>${sub ? `<p>${sub}</p>` : ""}</div>`;
  const stepper = (n, total, label) => `<div class="rid-stepper" aria-label="Step ${n} of ${total}: ${esc(label)}"><div><span>${esc(label)}</span><span>Step ${n} of ${total}</span></div><div class="bars">${Array.from({ length: total }, (_, i) => `<i class="${i < n ? "on" : ""}"></i>`).join("")}</div></div>`;
  const alertBox = (msg, tone = "error") => (msg ? `<div class="rid-alert ${tone}" role="${tone === "error" ? "alert" : "status"}">${tone === "success" ? ICON.check : ICON.alert}<div>${msg}</div></div>` : "");
  const back = (label = "Back") => `<button type="button" class="rid-back" data-back>${ICON.back}${esc(label)}</button>`;
  const badge = (icon) => `<div class="rid-badge">${ICON[icon]}</div>`;
  const chip = (email) => `<div class="rid-chip"><div><span class="av">${esc(email.slice(0, 1))}</span><span class="em">${esc(email)}</span></div><button type="button" data-edit>Edit</button></div>`;
  const fieldErr = (msg) => (msg ? `<p class="rid-ferr">${ICON.alert}${esc(msg)}</p>` : "");
  function field({ label, name, type = "text", value = "", error, hint, attrs = "", code = false }) {
    const id = `f-${name}`;
    return `<div class="rid-field${code ? " code" : ""}"><label for="${id}">${esc(label)}</label><div class="wrap"><input id="${id}" name="${name}" type="${type}" value="${esc(value)}" ${error ? 'aria-invalid="true"' : ""} ${attrs} />${type === "password" ? `<button type="button" class="eye" data-eye aria-label="Show password">${ICON.eye}</button>` : ""}</div>${error ? fieldErr(error) : hint ? `<div class="rid-hint">${hint}</div>` : ""}</div>`;
  }
  const button = (label, { loading = false, disabled = false, ghost = false, type = "submit", attrs = "" } = {}) =>
    `<button type="${type}" class="rid-btn ${ghost ? "ghost" : "primary"}" ${loading || disabled ? "disabled" : ""} ${attrs}>${loading ? spinner : ""}${esc(label)}</button>`;
  const linkBtn = (label, attr) => `<button type="button" class="rid-link" ${attr}>${esc(label)}</button>`;
  const checksList = (pw) => `<ul class="rid-checks">${passwordChecks(pw).map((c) => `<li class="${c.ok ? "ok" : ""}"><span>${c.ok ? ICON.check : ""}</span>${c.label}</li>`).join("")}</ul>`;

  // ---------- state + rendering ----------
  let clerk = null;
  const S = { mode: modeFromUrl(), step: "email", email: params.get("email") || "", password: "", confirm: "", code: "", month: "", day: "", year: "", country: "", username: "", human: "idle", humanFix: null, error: null, fe: {}, busy: false, emailTaken: false };
  const set = (patch) => { Object.assign(S, patch); render(); };
  const go = (step) => set({ step, error: null, fe: {} });

  function render() {
    const view = { signin: signInView, signup: signUpView, forgot: forgotView }[S.mode]();
    card.innerHTML = `<div class="rid-step" data-key="${S.mode}-${S.step}">${view}</div>`;
    document.title = { signin: "Sign in", signup: "Create your RanEddie ID", forgot: "Reset your password" }[S.mode] + " · RanEddie ID";
    const focus = card.querySelector("[autofocus]") || card.querySelector("input:not([type=hidden])");
    if (focus && document.activeElement?.closest?.("#rid-card") == null) focus.focus();
  }

  // Keep typed values in state without re-rendering on every keystroke.
  card.addEventListener("input", (e) => {
    const t = e.target;
    if (!t.name) return;
    let v = t.value;
    if (t.name === "code") v = t.value = v.replace(/\D/g, "").slice(0, 6);
    if (t.name === "username") v = t.value = v.replace(/\s/g, "");
    S[t.name] = v;
    if (S.fe[t.name]) { S.fe[t.name] = null; t.removeAttribute("aria-invalid"); t.closest(".rid-field")?.querySelector(".rid-ferr")?.remove(); }
    if (t.name === "password" && S.mode === "signup" && S.step === "password") {
      card.querySelector(".rid-checks").outerHTML = checksList(v);
      card.querySelector("[data-strength]").outerHTML = strengthMeter(v);
    }
    if (t.name === "password" && S.mode === "forgot") card.querySelector(".rid-checks").outerHTML = checksList(v);
    if (t.name === "code") card.querySelector("button[type=submit]")?.toggleAttribute("disabled", v.length < 6);
    if (["email", "password", "month", "day", "year", "country"].includes(t.name) && S.human !== "idle") S.human = "idle";
  });
  card.addEventListener("change", (e) => {
    const t = e.target;
    if (!t.name) return;
    S[t.name] = t.value;
    if ((t.name === "month" || t.name === "year") && S.mode === "signup") render();
  });
  card.addEventListener("click", (e) => {
    const b = e.target.closest("button,a");
    if (!b) return;
    if (b.hasAttribute("data-eye")) {
      const i = b.previousElementSibling;
      i.type = i.type === "password" ? "text" : "password";
      b.setAttribute("aria-label", i.type === "password" ? "Show password" : "Hide password");
    }
    if (b.dataset.mode) { e.preventDefault(); history.replaceState(null, "", b.getAttribute("href")); set({ mode: b.dataset.mode, step: "email", error: null, fe: {}, emailTaken: false }); }
  });
  card.addEventListener("submit", (e) => { e.preventDefault(); actions[`${S.mode}:${S.step}`]?.(); });
  card.addEventListener("click", (e) => {
    const b = e.target.closest("[data-back],[data-edit],[data-act]");
    if (!b) return;
    if (b.hasAttribute("data-back") || b.hasAttribute("data-edit")) backStep();
    else actions[b.dataset.act]?.();
  });

  async function finish(sessionId) {
    await clerk.setActive({ session: sessionId });
    F.auth.setRid(F.rid.profile(clerk.user));
    location.replace(target());
  }
  const fail = (err) => set({ busy: false, error: esc(clerkError(err).message) });

  // ---------- sign in ----------
  function signInView() {
    const loading = S.busy;
    if (S.step === "email") return `<form novalidate>${heading("Sign in", "FIZZ is a RANEDDIE product. Use your RanEddie ID to continue.")}${alertBox(S.error)}
      ${field({ label: "Email", name: "email", type: "email", value: S.email, error: S.fe.email, attrs: 'autocomplete="username" inputmode="email" placeholder="you@example.com" autofocus' })}
      <div class="mt6">${button("Next", { loading })}</div>
      <p class="rid-foot">New here? <a href="${withRedirect("signup")}" data-mode="signup">Create a RanEddie ID</a></p></form>`;
    if (S.step === "password") return `<form novalidate>${back()}${heading("Enter your password")}${chip(S.email)}${alertBox(S.error)}
      ${field({ label: "Password", name: "password", type: "password", value: S.password, attrs: 'autocomplete="current-password" autofocus' })}
      <div class="rid-right"><a href="${withRedirect("forgot", `&email=${encodeURIComponent(S.email)}`)}" data-mode="forgot">Forgot password?</a></div>
      <div class="mt5">${button("Sign in", { loading })}</div></form>`;
    return `<form novalidate>${back("Start over")}${badge("mail")}${heading("Check your email", `You're signing in on a new device. We sent a 6-digit code to <b>${esc(S.email)}</b>.`)}${alertBox(S.error)}
      ${field({ label: "Verification code", name: "code", value: S.code, code: true, attrs: 'inputmode="numeric" autocomplete="one-time-code" placeholder="000000" maxlength="6" autofocus' })}
      <div class="mt6">${button("Verify and sign in", { loading, disabled: S.code.length < 6 })}</div>${linkBtn("Send a new code", 'data-act="signin:resend"')}</form>`;
  }

  // ---------- sign up ----------
  const SU_STEPS = [["email", "Email"], ["password", "Password"], ["details", "About you"], ["human", "Security check"], ["username", "Username"]];
  const strengthMeter = (pw) => {
    const st = passwordStrength(pw);
    return `<div data-strength class="rid-strength s${st.score}">${pw ? `<div class="bars">${[1, 2, 3, 4].map((i) => `<i class="${i <= st.score ? "on" : ""}"></i>`).join("")}</div><p>${st.label}</p>` : ""}</div>`;
  };
  function signUpView() {
    const i = SU_STEPS.findIndex(([id]) => id === S.step);
    const sp = i >= 0 ? stepper(i + 1, SU_STEPS.length, SU_STEPS[i][1]) : "";
    const loading = S.busy;
    if (S.step === "email") return `<form novalidate>${sp}${heading("Create your RanEddie ID", "One account for FIZZ and all RanEddie games. Let's start with your email.")}
      ${field({ label: "Email", name: "email", type: "email", value: S.email, error: S.fe.email, attrs: 'autocomplete="email" inputmode="email" placeholder="you@example.com" autofocus' })}
      ${S.emailTaken ? alertBox(`You already have an account with this email. <a href="${withRedirect("signin", `&email=${encodeURIComponent(S.email.trim())}`)}" data-mode="signin">Sign in instead</a>`) : ""}
      <div class="mt6">${button("Next", { loading })}</div>
      <p class="rid-foot">Already have a RanEddie ID? <a href="${withRedirect("signin")}" data-mode="signin">Sign in</a></p></form>`;
    if (S.step === "password") return `<form novalidate>${back()}${sp}${heading("Create a password", "Make it strong — it protects your account.")}${chip(S.email)}
      ${field({ label: "Password", name: "password", type: "password", value: S.password, error: S.fe.password, attrs: 'autocomplete="new-password" autofocus' })}
      ${strengthMeter(S.password)}${checksList(S.password)}
      <div class="mt5">${field({ label: "Confirm password", name: "confirm", type: "password", value: S.confirm, error: S.fe.confirm, attrs: 'autocomplete="new-password"' })}</div>
      <div class="mt6">${button("Next")}</div></form>`;
    if (S.step === "details") {
      const thisYear = new Date().getFullYear();
      const maxDay = daysInMonth(Number(S.year), Number(S.month));
      const sel = (name, label, opts) => `<div class="rid-select"><select name="${name}" aria-label="${label}" ${S.fe.birth ? 'aria-invalid="true"' : ""}><option value="">${label}</option>${opts}</select></div>`;
      return `<form novalidate>${back()}${sp}${heading("Tell us about you", "We use this to keep RanEddie products safe and right for your age.")}
        <fieldset class="rid-fieldset"><legend>Date of birth</legend><div class="rid-birth">
        ${sel("month", "Month", MONTHS.map((m, k) => `<option value="${k}" ${String(k) === S.month ? "selected" : ""}>${m}</option>`).join(""))}
        ${sel("day", "Day", Array.from({ length: maxDay }, (_, k) => `<option value="${k + 1}" ${String(k + 1) === S.day ? "selected" : ""}>${k + 1}</option>`).join(""))}
        ${sel("year", "Year", Array.from({ length: 100 }, (_, k) => thisYear - k).map((y) => `<option value="${y}" ${String(y) === S.year ? "selected" : ""}>${y}</option>`).join(""))}
        </div>${fieldErr(S.fe.birth)}</fieldset>
        <div class="rid-field mt5"><label for="f-country">Country</label><div class="rid-select"><select id="f-country" name="country" ${S.fe.country ? 'aria-invalid="true"' : ""}><option value="">Choose your country</option>${countries().map((c) => `<option value="${c.code}" ${c.code === S.country ? "selected" : ""}>${c.flag} ${esc(c.name)}</option>`).join("")}</select></div>${fieldErr(S.fe.country)}</div>
        <p class="rid-small">Your date of birth isn't shown to anyone.</p>
        <div class="mt6">${button("Next")}</div></form>`;
    }
    if (S.step === "human") {
      const fix = S.humanFix ? ` <button type="button" class="rid-inline" data-act="signup:fix">${S.humanFix === "email" ? "Change email" : "Change password"}</button>` : "";
      return `<div>${back()}${sp}${heading("Quick security check", "Confirm you're a real person, not a bot.")}${S.error ? alertBox(S.error + fix) : ""}
        <button type="button" class="rid-human ${S.human}" data-act="signup:human" ${S.human !== "idle" ? "disabled" : ""} aria-pressed="${S.human === "ok"}">
          <span class="box">${S.human === "checking" ? spinner : S.human === "ok" ? ICON.check : ""}</span>
          <span class="txt"><b>${S.human === "ok" ? "You're verified" : S.human === "checking" ? "Verifying…" : "I'm not a robot"}</b><small>Protected by Clerk bot protection</small></span>${ICON.shield}</button>
        <div id="clerk-captcha"></div>
        <div class="mt6">${button("Next", { type: "button", disabled: S.human !== "ok", attrs: 'data-act="signup:toUsername"' })}</div></div>`;
    }
    if (S.step === "username") return `<form novalidate>${back()}${sp}${heading("Pick a username", "This is how you'll appear in RanEddie products.")}${alertBox(S.error)}
      ${field({ label: "Username", name: "username", value: S.username, error: S.fe.username, hint: "4–20 characters: letters, numbers, _ and -", attrs: 'autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="SnakeMaster" maxlength="20" autofocus' })}
      <div class="mt6">${button("Create account", { loading })}</div>
      <p class="rid-small center">By creating an account you agree to the <a href="terms.html">Terms</a> and <a href="privacy.html">Privacy Policy</a>.</p></form>`;
    return `<form novalidate>${badge("mail")}${heading("Verify your email", `Last step! We sent a 6-digit code to <b>${esc(S.email)}</b>.`)}${alertBox(S.error)}
      ${field({ label: "Verification code", name: "code", value: S.code, code: true, attrs: 'inputmode="numeric" autocomplete="one-time-code" placeholder="000000" maxlength="6" autofocus' })}
      <div class="mt6">${button("Verify and finish", { loading, disabled: S.code.length < 6 })}</div>${linkBtn("Send a new code", 'data-act="signup:resend"')}</form>`;
  }

  // ---------- forgot password ----------
  function forgotView() {
    const n = { email: 1, code: 2, password: 3 }[S.step];
    const sp = stepper(n, 3, ["Email", "Code", "New password"][n - 1]);
    const loading = S.busy;
    if (S.step === "email") return `<form novalidate><a class="rid-back" href="${withRedirect("signin")}" data-mode="signin">${ICON.back}Back to sign in</a>${sp}${badge("lock")}
      ${heading("Forgot your password?", "Enter the email of your RanEddie ID and we'll send you a code to reset it.")}${alertBox(S.error)}
      ${field({ label: "Email", name: "email", type: "email", value: S.email, error: S.fe.email, attrs: 'autocomplete="username" inputmode="email" placeholder="you@example.com" autofocus' })}
      <div class="mt6">${button("Send reset code", { loading })}</div></form>`;
    if (S.step === "code") return `<form novalidate>${back()}${sp}${badge("mail")}${heading("Check your email", `We sent a 6-digit code to <b>${esc(S.email)}</b>.`)}${alertBox(S.error)}
      ${field({ label: "Reset code", name: "code", value: S.code, code: true, attrs: 'inputmode="numeric" autocomplete="one-time-code" placeholder="000000" maxlength="6" autofocus' })}
      <div class="mt6">${button("Continue", { loading, disabled: S.code.length < 6 })}</div>${linkBtn("Send a new code", 'data-act="forgot:resend"')}</form>`;
    return `<form novalidate>${sp}${heading("Choose a new password", "You'll be signed in right after.")}${chip(S.email)}${alertBox(S.error)}
      ${field({ label: "New password", name: "password", type: "password", value: S.password, error: S.fe.password, attrs: 'autocomplete="new-password" autofocus' })}
      ${checksList(S.password)}
      <div class="mt5">${field({ label: "Confirm new password", name: "confirm", type: "password", value: S.confirm, error: S.fe.confirm, attrs: 'autocomplete="new-password"' })}</div>
      <div class="mt6">${button("Reset password", { loading })}</div></form>`;
  }

  function backStep() {
    if (S.mode === "signin") { S.password = ""; S.code = ""; return go("email"); }
    if (S.mode === "forgot") return go("email");
    const order = ["email", "password", "details", "human", "username"];
    const i = order.indexOf(S.step);
    go(order[Math.max(0, i - 1)]);
  }

  const signIn = () => clerk.client.signIn;
  const signUp = () => clerk.client.signUp;
  const birthDate = () => (S.month && S.day && S.year ? `${S.year}-${String(Number(S.month) + 1).padStart(2, "0")}-${S.day.padStart(2, "0")}` : "");

  async function sendSecondFactorCode(si) {
    const f = si.supportedSecondFactors?.find((x) => x.strategy === "email_code");
    if (!f) throw { message: "This account needs another sign-in step that FIZZ doesn't support yet." };
    await si.prepareSecondFactor({ strategy: "email_code", emailAddressId: f.emailAddressId });
  }

  async function finishSignUp() {
    let su = signUp();
    if (su.status !== "complete" && su.missingFields?.includes("legal_accepted")) su = await su.update({ legalAccepted: true });
    if (su.status !== "complete" && su.missingFields?.includes("username")) return set({ busy: false, step: "username", fe: { username: "Choose a username to finish." } });
    if (su.status === "complete") return finish(su.createdSessionId);
    const missing = [...(su.missingFields || []), ...(su.unverifiedFields || [])].join(", ");
    set({ busy: false, error: esc(`Your email is verified, but your account still needs: ${missing || "unknown"}. Please contact support.`) });
  }

  const actions = {
    // sign in
    "signin:email": async () => {
      if (!isEmail(S.email)) return set({ error: "Enter a valid email address." });
      set({ busy: true, error: null });
      try { await signIn().create({ identifier: S.email.trim() }); set({ busy: false, step: "password" }); } catch (e) { fail(e); }
    },
    "signin:password": async () => {
      if (!S.password) return set({ error: "Enter your password." });
      set({ busy: true, error: null });
      try {
        const si = await signIn().attemptFirstFactor({ strategy: "password", password: S.password });
        if (si.status === "complete") return finish(si.createdSessionId);
        if (si.status === "needs_second_factor" || si.status === "needs_client_trust") { await sendSecondFactorCode(si); return set({ busy: false, step: "verify" }); }
        set({ busy: false, error: "This account needs another sign-in step that FIZZ doesn't support yet." });
      } catch (e) { fail(e); }
    },
    "signin:verify": async () => {
      set({ busy: true, error: null });
      try {
        const si = await signIn().attemptSecondFactor({ strategy: "email_code", code: S.code.trim() });
        if (si.status === "complete") return finish(si.createdSessionId);
        set({ busy: false, error: "We couldn't finish signing you in. Please try again." });
      } catch (e) { fail(e); }
    },
    "signin:resend": async () => { try { await sendSecondFactorCode(signIn()); set({ error: null }); F.toast("New code sent"); } catch (e) { fail(e); } },

    // sign up
    "signup:email": async () => {
      if (!isEmail(S.email)) return set({ emailTaken: false, fe: { email: "Enter a valid email address." } });
      // Tell the player right away when the email already has a RanEddie ID (Clerk would refuse it later anyway)
      set({ busy: true, emailTaken: false, fe: {} });
      let taken = false;
      try {
        const res = await fetch("/api/email-taken", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: S.email.trim() }) });
        taken = res.ok && (await res.json()).taken === true;
      } catch { /* offline: carry on */ }
      if (taken) return set({ busy: false, emailTaken: true, fe: { email: "This email already has a RanEddie ID." } });
      set({ busy: false });
      go("password");
    },
    "signup:password": () => {
      const fe = {};
      if (!passwordChecks(S.password).every((c) => c.ok)) fe.password = "Your password doesn't meet all the requirements yet.";
      if (S.confirm !== S.password) fe.confirm = "Passwords don't match.";
      if (fe.password || fe.confirm) return set({ fe });
      S.country ||= guessCountry();
      go("details");
    },
    "signup:details": () => {
      if (!S.month || !S.day || !S.year) return set({ fe: { birth: "Enter your full date of birth." } });
      const birth = new Date(Number(S.year), Number(S.month), Number(S.day));
      if (birth > new Date()) return set({ fe: { birth: "That date is in the future." } });
      if (ageOn(birth) < MIN_AGE) return set({ fe: { birth: `You must be at least ${MIN_AGE} years old to create a RanEddie ID.` } });
      if (!S.country) return set({ fe: { country: "Choose your country." } });
      go("human");
    },
    // Starting the sign-up runs Clerk's bot protection (an invisible check, or a challenge in #clerk-captcha).
    "signup:human": async () => {
      if (S.human !== "idle") return;
      set({ human: "checking", error: null, humanFix: null });
      try {
        await signUp().create({ emailAddress: S.email.trim(), password: S.password, unsafeMetadata: { birthDate: birthDate(), country: S.country } });
        set({ human: "ok" });
      } catch (e) {
        const { code, message, param } = clerkError(e);
        const humanFix = code.startsWith("form_password") || param === "password" ? "password" : code === "form_identifier_exists" || param === "email_address" ? "email" : null;
        set({ human: "idle", error: esc(message), humanFix });
      }
    },
    "signup:fix": () => go(S.humanFix),
    "signup:toUsername": () => { if (S.human === "ok") go("username"); },
    "signup:username": async () => {
      const err = usernameError(S.username);
      if (err) return set({ fe: { username: err } });
      set({ busy: true, error: null, fe: {} });
      try {
        const su = await signUp().update({ username: S.username });
        if (su.status === "complete") return finish(su.createdSessionId);
        if (su.unverifiedFields?.includes("email_address")) { await su.prepareEmailAddressVerification({ strategy: "email_code" }); return set({ busy: false, step: "verify", error: null, fe: {} }); }
        await finishSignUp();
      } catch (e) {
        const { code, message } = clerkError(e);
        if (code.startsWith("form_username") || code === "form_identifier_exists") set({ busy: false, fe: { username: message } });
        else set({ busy: false, error: esc(message) });
      }
    },
    "signup:verify": async () => {
      set({ busy: true, error: null });
      try {
        if (signUp().unverifiedFields?.includes("email_address")) await signUp().attemptEmailAddressVerification({ code: S.code.trim() });
        await finishSignUp();
      } catch (e) { fail(e); }
    },
    "signup:resend": async () => { try { await signUp().prepareEmailAddressVerification({ strategy: "email_code" }); set({ error: null }); F.toast("New code sent"); } catch (e) { fail(e); } },

    // forgot password
    "forgot:email": async () => {
      if (!isEmail(S.email)) return set({ fe: { email: "Enter a valid email address." } });
      set({ busy: true, error: null, fe: {} });
      try { await signIn().create({ strategy: "reset_password_email_code", identifier: S.email.trim() }); set({ busy: false, step: "code" }); } catch (e) { fail(e); }
    },
    "forgot:resend": async () => { try { await signIn().create({ strategy: "reset_password_email_code", identifier: S.email.trim() }); set({ error: null }); F.toast("New code sent"); } catch (e) { fail(e); } },
    "forgot:code": async () => {
      set({ busy: true, error: null });
      try { await signIn().attemptFirstFactor({ strategy: "reset_password_email_code", code: S.code.trim() }); set({ busy: false, step: "password", password: "", confirm: "" }); } catch (e) { fail(e); }
    },
    "forgot:password": async () => {
      const fe = {};
      if (!passwordChecks(S.password).every((c) => c.ok)) fe.password = "Your new password doesn't meet all the requirements yet.";
      if (S.confirm !== S.password) fe.confirm = "Passwords don't match.";
      if (fe.password || fe.confirm) return set({ fe });
      set({ busy: true, error: null, fe: {} });
      try {
        const si = await signIn().resetPassword({ password: S.password, signOutOfOtherSessions: true });
        if (si.status === "complete") return finish(si.createdSessionId);
        set({ busy: false, error: "Your password was changed. Please sign in with the new password." });
      } catch (e) { fail(e); }
    },
  };

  // ---------- start ----------
  card.innerHTML = `<div class="rid-loading">${spinner}</div>`;
  F.rid.load().then((c) => {
    clerk = c;
    if (!clerk) {
      // No RanEddie ID on this deployment: let people into FIZZ for this browser session instead of looping.
      try { sessionStorage.setItem("fizz.rid.off", "1"); } catch {}
      card.innerHTML = `${heading("RanEddie ID isn't available here yet", "You can keep using FIZZ and FIZZ DEV without an account. Your chats and projects stay in this browser.")}<a class="rid-btn primary" href="${esc(target())}">Continue to FIZZ</a>`;
      return;
    }
    try { sessionStorage.removeItem("fizz.rid.off"); } catch {}
    if (clerk.user) {
      F.auth.setRid(F.rid.profile(clerk.user));
      const p = F.rid.profile(clerk.user);
      card.innerHTML = `${heading("You're signed in", `Signed in as <b>${esc(p.email || p.name)}</b>.`)}<a class="rid-btn primary" href="${esc(target())}">Continue</a><button type="button" class="rid-link" id="rid-switch">Use another account</button>`;
      card.querySelector("#rid-switch").onclick = async () => { await clerk.signOut(); F.auth.setRid(null); render(); };
      return;
    }
    render();
  });
})();
