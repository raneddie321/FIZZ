import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "./util.mjs";

// OAuth providers handled on the server. Google uses Google Identity Services in the
// browser (client ID only), so it is not listed here.
/** What FIZZ asks Canva for: the profile, designs (list, create, export) and uploads. Tick the same scopes in the Canva Developer Portal. */
export const CANVA_SCOPES = "profile:read design:meta:read design:content:read design:content:write asset:read asset:write";
// Shopify: each store signs in on its own (the store's address is part of every URL). The Vercel variables may be
// named SHOPIFY_CLIENT_ID/SECRET or SHOPIFY_CLINET_ID/SECRET (as first typed).
export const shopifyId = () => env("SHOPIFY_CLIENT_ID") || env("SHOPIFY_CLINET_ID") || env("SHOPIFY_API_KEY");
export const shopifySecret = () => env("SHOPIFY_CLIENT_SECRET") || env("SHOPIFY_CLINET_SECRET") || env("SHOPIFY_API_SECRET");
export const SHOPIFY_SCOPES = "read_products,write_products,read_orders,read_customers,read_inventory,write_inventory,read_content,write_content,read_files,write_files";
/** "my-store", "my-store.myshopify.com" or "https://my-store.myshopify.com/admin" → "my-store.myshopify.com", or null. */
export function shopDomain(input) {
  let s = String(input || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (/^[a-z0-9][a-z0-9-]{0,60}$/.test(s)) s = `${s}.myshopify.com`;
  return /^[a-z0-9][a-z0-9-]{0,60}\.myshopify\.com$/.test(s) ? s : null;
}
/** Shopify signs its redirect back: HMAC-SHA256 of the other query parameters, sorted, with the app's secret. */
export function shopifyHmacOk(searchParams, secret) {
  const given = searchParams.get("hmac") || "";
  const msg = [...searchParams.entries()].filter(([k]) => k !== "hmac" && k !== "signature").sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join("&");
  const want = createHmac("sha256", secret).update(msg).digest("hex");
  return given.length === want.length && timingSafeEqual(Buffer.from(given), Buffer.from(want));
}
export const PROVIDERS = {
  shopify: {
    cookie: "fizz_sh",
    pkce: false,
    configured: () => Boolean(shopifyId() && shopifySecret()),
    /** The store comes with the start link (?shop=…) and is remembered for the callback. */
    prepare: (url) => { const shop = shopDomain(url.searchParams.get("shop")); if (!shop) throw Object.assign(new Error("Enter your store's address, like my-store or my-store.myshopify.com."), { status: 400 }); return { shop }; },
    authorizeUrl: (origin, state, _challenge, extra) => {
      const q = { client_id: shopifyId(), scope: env("SHOPIFY_SCOPES") || SHOPIFY_SCOPES, redirect_uri: `${origin}/api/oauth/shopify/callback`, state };
      return `https://${extra.shop}/admin/oauth/authorize?${Object.entries(q).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&")}`;
    },
    async exchange(origin, code, _verifier, extra, url) {
      if (!shopifyHmacOk(url.searchParams, shopifySecret())) throw new Error("Shopify's reply couldn't be verified.");
      if (shopDomain(url.searchParams.get("shop")) !== extra.shop) throw new Error("The store in Shopify's reply isn't the one you chose.");
      const res = await fetch(`https://${extra.shop}/admin/oauth/access_token`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ client_id: shopifyId(), client_secret: shopifySecret(), code }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.access_token) throw new Error(data.error_description || data.errors || data.error || `Shopify token request failed (${res.status}).`);
      return { t: data.access_token, shop: extra.shop, label: extra.shop, scopes: String(data.scope || "").split(",").filter(Boolean), ...(data.refresh_token ? { r: data.refresh_token, at: Date.now() + (Number(data.expires_in) || 3600) * 1000 } : {}) };
    },
  },
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
  canva: {
    cookie: "fizz_cv",
    pkce: true,
    configured: () => Boolean(env("CANVA_CLIENT_ID") && env("CANVA_CLIENT_SECRET")),
    // Canva wants code_challenge_method "s256" (lowercase) and the scopes separated by %20, not "+":
    // with URLSearchParams' "+" and "S256" it answers invalid_request.
    authorizeUrl: (origin, state, challenge) => {
      const q = {
        client_id: env("CANVA_CLIENT_ID"),
        redirect_uri: `${origin}/api/oauth/canva/callback`,
        response_type: "code",
        scope: env("CANVA_SCOPES") || CANVA_SCOPES,
        state,
        code_challenge: challenge,
        code_challenge_method: "s256",
      };
      return `https://www.canva.com/api/oauth/authorize?${Object.entries(q).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&")}`;
    },
    async exchange(origin, code, verifier) {
      const body = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        code_verifier: verifier,
        redirect_uri: `${origin}/api/oauth/canva/callback`,
        client_id: env("CANVA_CLIENT_ID"),
        client_secret: env("CANVA_CLIENT_SECRET"),
      });
      const res = await fetch("https://api.canva.com/rest/v1/oauth/token", {
        method: "POST",
        headers: { Authorization: `Basic ${Buffer.from(`${env("CANVA_CLIENT_ID")}:${env("CANVA_CLIENT_SECRET")}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: new URLSearchParams({ grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: `${origin}/api/oauth/canva/callback` }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.access_token) throw new Error(data.error_description || data.error?.message || data.message || `Canva token request failed (${res.status}).`);
      return {
        t: data.access_token,
        r: data.refresh_token,
        at: Date.now() + (Number(data.expires_in) || 3600) * 1000,
        label: "Canva account",
        scopes: String(data.scope || env("CANVA_SCOPES") || "").split(/[ ,]+/).filter(Boolean),
      };
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
