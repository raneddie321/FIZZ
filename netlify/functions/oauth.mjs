import { YEAR, clearBigCookie, clearCookie, error, getCookie, setBigCookie, json, pkceChallenge, randomId, readJson, safeEqual, sameOrigin, seal, secretConfigured, setCookie, unseal } from "../lib/util.mjs";
import { PROVIDERS } from "../lib/providers.mjs";

const STATE_COOKIE = "fizz_oauth";

function back(origin, params) {
  const u = new URL("/dev.html", origin);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}

export default async (req, context) => {
  const { provider, action } = context.params;
  const p = PROVIDERS[provider];
  const origin = new URL(req.url).origin;
  if (!p) return error(404, "Unknown provider.");
  // GitHub and Vercel also connect with a personal token — no OAuth app needed on the server.
  if (action === "token" && provider === "github") {
    if (req.method !== "POST" || !sameOrigin(req)) return error(403, "Not allowed.");
    if (!secretConfigured()) return error(503, "FIZZ_SECRET isn't set on this server.", "not_configured");
    const { token } = await readJson(req, 10_000).catch(() => ({}));
    const t = String(token || "").trim();
    if (!/^(gh[pousr]_[A-Za-z0-9]{20,255}|github_pat_[A-Za-z0-9_]{20,255})$/.test(t)) return error(400, "That doesn't look like a GitHub token (it starts with ghp_ or github_pat_).", "bad_token");
    const res = await fetch("https://api.github.com/user", { headers: { Authorization: `Bearer ${t}`, "User-Agent": "FIZZ-DEV", Accept: "application/vnd.github+json" } }).catch(() => null);
    const me = res ? await res.json().catch(() => null) : null;
    if (!res?.ok || !me?.login) return error(res && res.status === 401 ? 401 : 502, res?.status === 401 ? "GitHub didn't accept this token. Check that you copied all of it and that it hasn't expired." : "Couldn't reach GitHub. Try again.", "bad_token");
    const scopes = (res.headers.get("x-oauth-scopes") || "").split(",").map((x) => x.trim()).filter(Boolean);
    if (t.startsWith("ghp_") && !(scopes.includes("repo") && scopes.includes("workflow"))) return error(400, `This token needs the "repo" and "workflow" scopes (it has: ${scopes.join(", ") || "none"}). Make a new one with both ticked.`, "bad_token");
    const headers = new Headers();
    setCookie(headers, p.cookie, seal({ t, label: `@${me.login}`, kind: "token", scopes }), { maxAge: YEAR });
    return json({ ok: true, account: `@${me.login}` }, { headers });
  }
  if (action === "token" && provider === "vercel") {
    if (req.method !== "POST" || !sameOrigin(req)) return error(403, "Not allowed.");
    if (!secretConfigured()) return error(503, "FIZZ_SECRET isn't set on this server.", "not_configured");
    const { token } = await readJson(req, 10_000).catch(() => ({}));
    const t = String(token || "").trim();
    if (!/^[A-Za-z0-9_-]{16,200}$/.test(t)) return error(400, "That doesn't look like a Vercel token. Create one at vercel.com/account/settings/tokens and paste it.", "bad_token");
    const res = await fetch("https://api.vercel.com/v2/user", { headers: { Authorization: `Bearer ${t}` } }).catch(() => null);
    const me = res ? await res.json().catch(() => null) : null;
    if (!res?.ok || !me?.user) return error(res?.status === 403 || res?.status === 401 ? 401 : 502, res && (res.status === 401 || res.status === 403) ? "Vercel didn't accept this token. Check that you copied all of it and that it hasn't expired." : "Couldn't reach Vercel. Try again.", "bad_token");
    const headers = new Headers();
    setCookie(headers, p.cookie, seal({ t, label: me.user.email || me.user.username || "Vercel account", kind: "token", scopes: [] }), { maxAge: YEAR });
    return json({ ok: true, account: me.user.email || me.user.username }, { headers });
  }
  if (!secretConfigured() || !p.configured()) return error(503, `${provider} isn't configured on this server yet.`, "not_configured");

  if (action === "start") {
    const state = randomId();
    const verifier = p.pkce ? randomId(48) : undefined;
    let extra = {};
    try { extra = p.prepare ? p.prepare(new URL(req.url)) : {}; } catch (e) { return error(e.status || 400, e.message); }
    const headers = new Headers({ Location: p.authorizeUrl(origin, state, verifier && pkceChallenge(verifier), extra) });
    setCookie(headers, STATE_COOKIE, seal({ provider, state, verifier, extra, exp: Date.now() + 10 * 60_000 }), { maxAge: 600 });
    return new Response(null, { status: 302, headers });
  }

  if (action === "callback") {
    const url = new URL(req.url);
    const saved = unseal(getCookie(req, STATE_COOKIE));
    const headers = new Headers();
    clearCookie(headers, STATE_COOKIE);
    if (url.searchParams.get("error")) {
      // The provider's own explanation (no secrets in it) helps far more than the bare code.
      const why = [url.searchParams.get("error"), url.searchParams.get("error_description")].filter(Boolean).join(": ").slice(0, 300);
      console.error(`[oauth:${provider}] the provider sent the user back with an error: ${why}`);
      headers.set("Location", back(origin, { connect_error: provider, reason: why }));
      return new Response(null, { status: 302, headers });
    }
    if (!saved || saved.provider !== provider || !safeEqual(saved.state, url.searchParams.get("state") || "")) {
      headers.set("Location", back(origin, { connect_error: provider, reason: "expired" }));
      return new Response(null, { status: 302, headers });
    }
    try {
      const session = await p.exchange(origin, url.searchParams.get("code"), saved.verifier, saved.extra || {}, url);
      setBigCookie(headers, p.cookie, seal(session), { maxAge: YEAR });
      headers.set("Location", back(origin, { connected: provider }));
    } catch (e) {
      console.error(`[oauth:${provider}]`, e);
      // Pass the provider's own error text back (no secrets in it) so the page can show what went wrong.
      headers.set("Location", back(origin, { connect_error: provider, reason: String(e.message || "exchange_failed").slice(0, 160) }));
    }
    return new Response(null, { status: 302, headers });
  }

  if (action === "disconnect") {
    if (req.method !== "POST" || !sameOrigin(req)) return error(403, "Not allowed.");
    const headers = new Headers();
    clearBigCookie(headers, p.cookie);
    return json({ ok: true }, { headers });
  }

  return error(404, "Unknown action.");
};

export const config = { path: "/api/oauth/:provider/:action" };
