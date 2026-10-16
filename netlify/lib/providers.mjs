import { env } from "./util.mjs";

// OAuth providers handled on the server. Google uses Google Identity Services in the
// browser (client ID only), so it is not listed here.
export const PROVIDERS = {
  github: {
    cookie: "fizz_gh",
    configured: () => Boolean(env("GITHUB_CLIENT_ID") && env("GITHUB_CLIENT_SECRET")),
    authorizeUrl: (origin, state) => {
      const u = new URL("https://github.com/login/oauth/authorize");
      u.searchParams.set("client_id", env("GITHUB_CLIENT_ID"));
      u.searchParams.set("redirect_uri", `${origin}/api/oauth/github/callback`);
      u.searchParams.set("scope", env("GITHUB_SCOPES") || "repo workflow read:user");
      u.searchParams.set("state", state);
      u.searchParams.set("allow_signup", "true");
      return u.toString();
    },
    async exchange(origin, code) {
      const res = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: env("GITHUB_CLIENT_ID"), client_secret: env("GITHUB_CLIENT_SECRET"), code, redirect_uri: `${origin}/api/oauth/github/callback` }),
      });
      const data = await res.json();
      if (!data.access_token) throw new Error(data.error_description || "GitHub did not return a token.");
      const me = await fetch("https://api.github.com/user", { headers: { Authorization: `Bearer ${data.access_token}`, "User-Agent": "FIZZ-DEV", Accept: "application/vnd.github+json" } }).then((r) => r.json());
      return { t: data.access_token, label: me.login ? `@${me.login}` : "GitHub account", scopes: (data.scope || "").split(",").filter(Boolean) };
    },
  },
  vercel: {
    cookie: "fizz_vc",
    pkce: true,
    configured: () => Boolean(env("VERCEL_CLIENT_ID") && env("VERCEL_CLIENT_SECRET")),
    authorizeUrl: (origin, state, challenge) => {
      const u = new URL(env("VERCEL_AUTHORIZE_URL") || "https://vercel.com/oauth/authorize");
      u.searchParams.set("client_id", env("VERCEL_CLIENT_ID"));
      u.searchParams.set("redirect_uri", `${origin}/api/oauth/vercel/callback`);
      u.searchParams.set("response_type", "code");
      u.searchParams.set("scope", env("VERCEL_SCOPES") || "openid email profile offline_access");
      u.searchParams.set("state", state);
      u.searchParams.set("code_challenge", challenge);
      u.searchParams.set("code_challenge_method", "S256");
      return u.toString();
    },
    async exchange(origin, code, verifier) {
      return vercelToken({ grant_type: "authorization_code", code, redirect_uri: `${origin}/api/oauth/vercel/callback`, code_verifier: verifier });
    },
  },
};

export async function vercelToken(params) {
  const body = new URLSearchParams({ client_id: env("VERCEL_CLIENT_ID"), client_secret: env("VERCEL_CLIENT_SECRET"), ...params });
  const res = await fetch(env("VERCEL_TOKEN_URL") || "https://api.vercel.com/login/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) throw new Error(data.error_description || data.error?.message || data.error || `Vercel token request failed (${res.status}).`);
  let label = "Vercel account";
  if (data.id_token) {
    const p = JSON.parse(Buffer.from(data.id_token.split(".")[1], "base64url").toString("utf8"));
    label = p.email || p.name || p.preferred_username || label;
  }
  return { t: data.access_token, r: data.refresh_token, at: Date.now() + (data.expires_in ?? 3600) * 1000, label, scopes: String(data.scope || "").split(" ").filter(Boolean) };
}
