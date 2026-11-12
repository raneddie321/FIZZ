/* Sign-in links that a command in the cloud sandbox prints — `vercel login`, `gh auth login`, `npx wrangler login`,
   `firebase login`, `netlify login` and any "open this URL and enter this code" device sign-in — are shown to the user
   as a card: the link as a button, the code with a copy button, and how long it stays valid (device codes usually
   expire after 10 to 15 minutes). The command keeps waiting in the sandbox while the user signs in. */
(function () {
  "use strict";
  const F = window.FIZZ;
  const esc = F.esc;
  const VALID_MIN = 10;
  const first = new Map(); // url → when it was first seen (the countdown starts there)
  const SERVICES = [[/vercel\.com/, "Vercel"], [/github\.com/, "GitHub"], [/cloudflare\.com/, "Cloudflare"], [/netlify\.com/, "Netlify"], [/google\.com|firebase/, "Google"], [/supabase\.com/, "Supabase"], [/microsoft|azure|live\.com/, "Microsoft"], [/npmjs\.com/, "npm"], [/expo\.dev/, "Expo"], [/fly\.io/, "Fly.io"], [/railway\.app/, "Railway"]];
  const SIGN_IN = /(device|login|log-in|signin|sign-in|oauth|authorize|activate|auth|verify|code|connect)/i;

  /** [{ url, code, service }] found in a command's output. */
  function detect(text) {
    const t = String(text || "").replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");
    const urls = [...new Set((t.match(/https?:\/\/[^\s"'<>()\]]+/g) || []).map((u) => u.replace(/[.,;:!?]+$/, "")))];
    const code = (/(?:one-time code|user code|device code|your code|enter (?:the )?code|code)[^A-Z0-9]{0,12}([A-Z0-9]{4}-?[A-Z0-9]{4})\b/i.exec(t) || [])[1] || "";
    const out = [];
    for (const url of urls) {
      let u;
      try { u = new URL(url); } catch { continue; }
      if (/^(localhost|127\.|0\.0\.0\.0)/.test(u.hostname)) continue;
      if (!SIGN_IN.test(u.pathname + u.search) && !/login|auth/.test(u.hostname)) continue;
      const own = u.searchParams.get("user_code") || u.searchParams.get("code") || "";
      out.push({ url, code: own ? "" : code, service: SERVICES.find(([re]) => re.test(u.hostname))?.[1] || u.hostname.replace(/^www\./, "") });
      if (!first.has(url)) first.set(url, Date.now());
    }
    return out.slice(0, 3);
  }
  function left(url) { const ms = (first.get(url) || Date.now()) + VALID_MIN * 60_000 - Date.now(); return ms <= 0 ? "may have expired — run the sign-in again" : `valid for about ${Math.max(1, Math.round(ms / 60_000))} more minute${ms > 90_000 ? "s" : ""}`; }
  /** The card(s) for a step or the terminal. */
  function html(links) {
    return (links || []).map((l) => `<div class="auth-link"><div><b>Sign in to ${esc(l.service)}</b><small>${esc(left(l.url))}. The command waits while you sign in.</small></div>${l.code ? `<code>${esc(l.code)}</code><button type="button" class="btn btn-outline btn-sm" data-copy-code="${esc(l.code)}">Copy code</button>` : ""}<a class="btn btn-sm" href="${esc(l.url)}" target="_blank" rel="noopener">Open sign-in page</a></div>`).join("");
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-copy-code]");
    if (!b) return;
    navigator.clipboard?.writeText(b.dataset.copyCode).then(() => F.toast("Code copied"), () => {});
  });
  F.authLinks = { detect, html };
})();
