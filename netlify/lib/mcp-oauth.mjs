// Signing in to MCP servers with OAuth, the way the MCP authorization spec describes it:
//   1. discover: an unauthenticated initialize → 401 + WWW-Authenticate → protected-resource metadata
//      (RFC 9728) → authorization-server metadata (RFC 8414 / OpenID) — endpoints, scopes, registration.
//   2. register the FIZZ client automatically (Dynamic Client Registration, RFC 7591) unless the user
//      brought their own client ID.
//   3. authorization code + PKCE (S256), with the MCP server named as the resource (RFC 8707).
//   4. tokens kept server-side with the rest of the connector; refreshed before they expire.
// Every request goes through mcp.send, which refuses private and internal addresses at every hop.
import { createHash, randomBytes } from "node:crypto";
import { send } from "./mcp.mjs";

const bad = (message, status = 400, code = "mcp_oauth") => Object.assign(new Error(message), { status, code });
const b64url = (buf) => Buffer.from(buf).toString("base64url");
const MS = 15_000;

async function getJson(url) {
  const res = await send(url, { method: "GET", headers: { Accept: "application/json", "User-Agent": "FIZZ-DEV/1.0" } }, MS);
  if (!res.ok) { res.body?.cancel?.().catch(() => {}); return null; }
  try { return await res.json(); } catch { return null; }
}

/** RFC 8414 / 9728 well-known URLs: the path of the resource or issuer goes after the well-known part. */
function wellKnown(base, suffix) {
  const u = new URL(base);
  const path = u.pathname.replace(/\/$/, "");
  return [...new Set([`${u.origin}/.well-known/${suffix}${path}`, `${u.origin}/.well-known/${suffix}`])];
}
const param = (header, name) => new RegExp(`${name}\\s*=\\s*"([^"]*)"`, "i").exec(header || "")?.[1] || new RegExp(`${name}\\s*=\\s*([^,\\s]+)`, "i").exec(header || "")?.[1] || "";

/**
 * What it takes to connect to `url`: { auth: "none" } when the server answers without signing in, or
 * { auth: "oauth", dcr, cimd, scopes, issuer, authorizationEndpoint, tokenEndpoint, registrationEndpoint }.
 */
export async function discover(url) {
  const init = { jsonrpc: "2.0", id: 0, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "FIZZ DEV", version: "1.0" } } };
  const res = await send(url, { method: "POST", headers: { Accept: "application/json, text/event-stream", "Content-Type": "application/json", "User-Agent": "FIZZ-DEV/1.0" }, body: JSON.stringify(init) }, MS);
  const www = res.headers.get("www-authenticate") || "";
  res.body?.cancel?.().catch(() => {});
  if (res.status !== 401 && !(res.status === 403 && www)) {
    if (res.ok) return { auth: "none" };
    // Not a sign-in problem: the add step's handshake will give the real error.
    return { auth: "unknown", status: res.status };
  }
  let resourceMeta = null;
  const metaUrl = param(www, "resource_metadata");
  if (metaUrl) resourceMeta = await getJson(new URL(metaUrl, url).href);
  if (!resourceMeta) for (const u of wellKnown(url, "oauth-protected-resource")) if ((resourceMeta = await getJson(u))) break;
  const issuer = resourceMeta?.authorization_servers?.[0] || new URL(url).origin;
  let as = null;
  for (const u of [...wellKnown(issuer, "oauth-authorization-server"), ...wellKnown(issuer, "openid-configuration")]) if ((as = await getJson(u))) break;
  if (!as?.authorization_endpoint || !as?.token_endpoint) throw bad("This MCP server asks you to sign in, but it doesn't publish where (no OAuth metadata). Use “No sign-in” and add its API key as a request header instead.", 502, "no_oauth_metadata");
  const scopes = resourceMeta?.scopes_supported || param(www, "scope").split(" ").filter(Boolean);
  return {
    auth: "oauth",
    issuer: as.issuer || issuer,
    authorizationEndpoint: as.authorization_endpoint,
    tokenEndpoint: as.token_endpoint,
    registrationEndpoint: as.registration_endpoint || null,
    dcr: Boolean(as.registration_endpoint),
    cimd: Boolean(as.client_id_metadata_document_supported),
    pkce: !as.code_challenge_methods_supported || as.code_challenge_methods_supported.includes("S256"),
    scopes: Array.isArray(scopes) ? scopes.slice(0, 20) : [],
    resource: resourceMeta?.resource || url,
  };
}

/** Dynamic Client Registration: FIZZ registers itself as a public client with this server. */
export async function register(meta, redirectUri) {
  if (!meta.registrationEndpoint) throw bad("This server doesn't allow automatic registration. Choose “Use your own OAuth client” and enter a client ID you registered with it.", 400, "no_dcr");
  const res = await send(meta.registrationEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": "FIZZ-DEV/1.0" },
    body: JSON.stringify({ client_name: "FIZZ DEV", redirect_uris: [redirectUri], grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none", ...(meta.scopes.length ? { scope: meta.scopes.join(" ") } : {}) }),
  }, MS);
  const j = await res.json().catch(() => null);
  if (!res.ok || !j?.client_id) throw bad(`The server didn't accept FIZZ's registration${j?.error_description ? `: ${String(j.error_description).slice(0, 200)}` : ` (${res.status})`}.`, 502, "dcr_failed");
  return { clientId: j.client_id, clientSecret: j.client_secret || "", authMethod: j.token_endpoint_auth_method || (j.client_secret ? "client_secret_post" : "none") };
}

/** The sign-in link (authorization code + PKCE) and what the callback needs to finish. */
export function authorizeUrl(meta, client, redirectUri, scope) {
  const verifier = b64url(randomBytes(48));
  const state = b64url(randomBytes(24));
  const u = new URL(meta.authorizationEndpoint);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", client.clientId);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("code_challenge", b64url(createHash("sha256").update(verifier).digest()));
  u.searchParams.set("code_challenge_method", "S256");
  u.searchParams.set("state", state);
  u.searchParams.set("resource", meta.resource);
  const sc = scope || meta.scopes.join(" ");
  if (sc) u.searchParams.set("scope", sc);
  return { url: u.href, verifier, state };
}

async function tokenRequest(o, params) {
  const body = new URLSearchParams({ ...params, client_id: o.clientId });
  const headers = { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json", "User-Agent": "FIZZ-DEV/1.0" };
  if (o.clientSecret) {
    if (o.authMethod === "client_secret_basic") headers.Authorization = `Basic ${Buffer.from(`${encodeURIComponent(o.clientId)}:${encodeURIComponent(o.clientSecret)}`).toString("base64")}`;
    else body.set("client_secret", o.clientSecret);
  }
  const res = await send(o.tokenEndpoint, { method: "POST", headers, body: body.toString() }, MS);
  const j = await res.json().catch(() => null);
  if (!res.ok || !j?.access_token) throw bad(`Sign-in didn't finish${j?.error_description ? `: ${String(j.error_description).slice(0, 200)}` : j?.error ? `: ${j.error}` : ` (${res.status})`}.`, 401, "token_failed");
  return { access: j.access_token, refresh: j.refresh_token || o.refresh || "", exp: j.expires_in ? Date.now() + Number(j.expires_in) * 1000 : 0, type: /^bearer$/i.test(j.token_type || "bearer") ? "Bearer" : j.token_type };
}

/** Exchanges the code from the callback for tokens. */
export const exchange = (o, code, verifier, redirectUri) => tokenRequest(o, { grant_type: "authorization_code", code, redirect_uri: redirectUri, code_verifier: verifier, resource: o.resource });

/** The server record with a fresh access token when the current one is about to expire. Returns { server, changed }. */
export async function ensureFresh(server) {
  const o = server.oauth;
  if (!o || !o.exp || o.exp > Date.now() + 60_000) return { server, changed: false };
  if (!o.refresh) return { server, changed: false };
  const t = await tokenRequest(o, { grant_type: "refresh_token", refresh_token: o.refresh, resource: o.resource });
  const next = { ...server, headers: { ...server.headers, Authorization: `${t.type} ${t.access}` }, oauth: { ...o, refresh: t.refresh, exp: t.exp } };
  return { server: next, changed: true };
}
