// RanEddie ID (Clerk) on the server: verifies a session token from the browser and reads/merges the
// user's private metadata. Uses only node:crypto and fetch, so the functions stay dependency-free.
import { createPublicKey, verify } from "node:crypto";
import { env } from "./util.mjs";

const API = "https://api.clerk.com/v1";
/** Clerk allows 8 KB of metadata per user, shared by every RanEddie product. */
export const METADATA_LIMIT = 8192;
/** FIZZ keeps only a few small settings (Snake Brawl already uses most of the space). */
export const FIZZ_LIMIT = 500;

export const clerkConfigured = () => Boolean(env("CLERK_SECRET_KEY"));
export const publishableKey = () => env("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY") || env("CLERK_PUBLISHABLE_KEY") || null;

async function clerkApi(path, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${env("CLERK_SECRET_KEY")}`, ...(init.body ? { "Content-Type": "application/json" } : {}) },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw Object.assign(new Error(data?.errors?.[0]?.message || `RanEddie ID error ${res.status}`), { status: 502 });
  return data;
}

/** True when an email already belongs to a RanEddie ID (so sign-up can say so on its first step). */
export async function emailTaken(email) {
  const users = await clerkApi(`/users?email_address=${encodeURIComponent(email)}&limit=1`);
  return Array.isArray(users) && users.length > 0;
}

let jwks = { at: 0, keys: [] };
async function signingKey(kid) {
  const find = () => jwks.keys.find((k) => k.kid === kid);
  if (!find() || Date.now() - jwks.at > 3600_000) jwks = { at: Date.now(), keys: (await clerkApi("/jwks")).keys || [] };
  const jwk = find();
  return jwk ? createPublicKey({ key: jwk, format: "jwk" }) : null;
}

/**
 * Returns the Clerk user id of a valid session token (Authorization: Bearer …), or null.
 * Checks the RS256 signature against the instance's keys, the expiry, and that the token was
 * issued for this site (azp).
 */
export async function sessionUser(req) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const [h, p, s] = token.split(".");
  if (!h || !p || !s) return null;
  let header, payload;
  try {
    header = JSON.parse(Buffer.from(h, "base64url").toString("utf8"));
    payload = JSON.parse(Buffer.from(p, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (header.alg !== "RS256" || !header.kid) return null;
  const key = await signingKey(header.kid);
  if (!key || !verify("RSA-SHA256", Buffer.from(`${h}.${p}`), key, Buffer.from(s, "base64url"))) return null;
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || payload.exp < now - 5) return null;
  if (typeof payload.nbf === "number" && payload.nbf > now + 5) return null;
  const origin = new URL(req.url).origin;
  const allowed = (env("CLERK_AUTHORIZED_PARTIES") || "").split(",").map((x) => x.trim()).filter(Boolean);
  if (payload.azp && !(allowed.length ? allowed : [origin]).includes(payload.azp)) return null;
  return typeof payload.sub === "string" && payload.sub.startsWith("user_") ? payload.sub : null;
}

/** The FIZZ settings that may be stored in the account. Everything else is dropped. */
const FIELDS = {
  theme: (v) => ["light", "dark", "system"].includes(v),
  style: (v) => ["balanced", "concise", "detailed"].includes(v),
  provider: (v) => ["fizz", "openrouter", "anthropic", "gemini"].includes(v),
  model: (v) => typeof v === "string" && /^[\w.:/-]{1,60}$/.test(v),
  orModel: (v) => typeof v === "string" && /^[\w.:/-]{1,80}$/.test(v),
  devMode: (v) => ["build", "ask"].includes(v),
  at: (v) => Number.isInteger(v) && v > 0,
};
export function cleanFizz(input) {
  const out = {};
  for (const [k, ok] of Object.entries(FIELDS)) if (input && ok(input[k])) out[k] = input[k];
  return out;
}

export async function readFizz(userId) {
  const user = await clerkApi(`/users/${encodeURIComponent(userId)}`);
  return user.private_metadata?.fizz ?? null;
}

/**
 * Saves FIZZ's settings under privateMetadata.fizz. Reads the current metadata first and only
 * merges the `fizz` key (Clerk's metadata endpoint merges), so other products' data is never touched.
 */
export async function writeFizz(userId, input) {
  const fizz = cleanFizz(input);
  const size = Buffer.byteLength(JSON.stringify(fizz));
  if (size > FIZZ_LIMIT) throw Object.assign(new Error("These settings are too large to save to your RanEddie ID."), { status: 413 });
  const user = await clerkApi(`/users/${encodeURIComponent(userId)}`);
  const merged = { ...(user.private_metadata || {}), fizz };
  if (Buffer.byteLength(JSON.stringify(merged)) > METADATA_LIMIT) throw Object.assign(new Error("Your RanEddie ID has no room left for FIZZ settings."), { status: 507 });
  await clerkApi(`/users/${encodeURIComponent(userId)}/metadata`, { method: "PATCH", body: JSON.stringify({ private_metadata: { fizz } }) });
  return fizz;
}
