import { clearCookie, error, getCookie, json, pkceChallenge, randomId, safeEqual, sameOrigin, seal, secretConfigured, setCookie, unseal } from "../lib/util.mjs";
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
  if (!secretConfigured() || !p.configured()) return error(503, `${provider} isn't configured on this server yet.`, "not_configured");

  if (action === "start") {
    const state = randomId();
    const verifier = p.pkce ? randomId(48) : undefined;
    const headers = new Headers({ Location: p.authorizeUrl(origin, state, verifier && pkceChallenge(verifier)) });
    setCookie(headers, STATE_COOKIE, seal({ provider, state, verifier, exp: Date.now() + 10 * 60_000 }), { maxAge: 600 });
    return new Response(null, { status: 302, headers });
  }

  if (action === "callback") {
    const url = new URL(req.url);
    const saved = unseal(getCookie(req, STATE_COOKIE));
    const headers = new Headers();
    clearCookie(headers, STATE_COOKIE);
    if (url.searchParams.get("error")) {
      headers.set("Location", back(origin, { connect_error: provider, reason: url.searchParams.get("error") }));
      return new Response(null, { status: 302, headers });
    }
    if (!saved || saved.provider !== provider || !safeEqual(saved.state, url.searchParams.get("state") || "")) {
      headers.set("Location", back(origin, { connect_error: provider, reason: "expired" }));
      return new Response(null, { status: 302, headers });
    }
    try {
      const session = await p.exchange(origin, url.searchParams.get("code"), saved.verifier);
      setCookie(headers, p.cookie, seal(session), { maxAge: 60 * 60 * 24 * 30 });
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
    clearCookie(headers, p.cookie);
    return json({ ok: true }, { headers });
  }

  return error(404, "Unknown action.");
};

export const config = { path: "/api/oauth/:provider/:action" };
