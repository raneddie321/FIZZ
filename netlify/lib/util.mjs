// Shared helpers for FIZZ Netlify Functions. No secrets are ever sent to the browser.
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const env = (name) => {
  const v = (globalThis.Netlify?.env?.get?.(name) ?? process.env[name] ?? "").trim();
  return v || undefined;
};

export function json(data, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(data), { ...init, headers });
}

export const error = (status, message, code = "error") => json({ error: { code, message } }, { status });

/** Rejects cross-site POSTs (CSRF) — the browser always sends Origin on cross-origin requests. */
export function sameOrigin(req) {
  if (req.method === "GET" || req.method === "HEAD") return true;
  const origin = req.headers.get("origin");
  return origin === new URL(req.url).origin;
}

// ---- encrypted cookies (AES-256-GCM, key derived from FIZZ_SECRET) ----
function key() {
  const secret = env("FIZZ_SECRET");
  if (!secret || secret.length < 32) return null;
  return createHash("sha256").update(secret).digest();
}
export const secretConfigured = () => Boolean(key());

export function seal(value) {
  const k = key();
  if (!k) throw new Error("FIZZ_SECRET is not configured");
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", k, iv);
  const data = Buffer.concat([c.update(JSON.stringify(value), "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), data]).toString("base64url");
}

export function unseal(token) {
  const k = key();
  if (!k || !token) return null;
  try {
    const buf = Buffer.from(token, "base64url");
    const d = createDecipheriv("aes-256-gcm", k, buf.subarray(0, 12));
    d.setAuthTag(buf.subarray(12, 28));
    const out = JSON.parse(Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString("utf8"));
    if (out.exp && out.exp < Date.now()) return null;
    return out;
  } catch {
    return null;
  }
}

export function getCookie(req, name) {
  const raw = req.headers.get("cookie") || "";
  for (const part of raw.split(/;\s*/)) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i) === name) return decodeURIComponent(part.slice(i + 1));
  }
  return null;
}

export function setCookie(headers, name, value, { maxAge = 60 * 60 * 24 * 30, path = "/api" } = {}) {
  headers.append(
    "Set-Cookie",
    `${name}=${encodeURIComponent(value)}; Path=${path}; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`,
  );
}
export const clearCookie = (headers, name, path = "/api") => headers.append("Set-Cookie", `${name}=; Path=${path}; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);

export const randomId = (n = 24) => randomBytes(n).toString("base64url");
export const pkceChallenge = (verifier) => createHash("sha256").update(verifier).digest("base64url");
export function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function readJson(req, maxBytes = 5_000_000) {
  const text = await req.text();
  if (text.length > maxBytes) throw Object.assign(new Error("Request is too large."), { status: 413 });
  try {
    return JSON.parse(text || "{}");
  } catch {
    throw Object.assign(new Error("Invalid JSON body."), { status: 400 });
  }
}

/** Decodes a JWT payload for display purposes only (never used for authorization). */
export function jwtPayload(jwt) {
  try {
    return JSON.parse(Buffer.from(String(jwt).split(".")[1], "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

export function normalizePath(p) {
  const s = String(p || "").replace(/\\/g, "/").replace(/^\.?\/+/, "");
  if (!s || s.length > 400 || s.split("/").some((x) => !x || x === "." || x === "..")) return null;
  return s;
}

// A sealed value too big for one cookie (browsers drop a cookie over ~4 KB without a word — Canva's tokens are long):
// split over name, name_1 … name_3, and read back the same way. Short values stay in one cookie as before.
const BIG_CHUNK = 3600, BIG_PARTS = 4;
export function setBigCookie(headers, name, value, opts = {}) {
  const v = String(value);
  if (v.length > BIG_CHUNK * BIG_PARTS) throw Object.assign(new Error("This sign-in is too large to keep."), { status: 507 });
  for (let i = 0; i < BIG_PARTS; i++) {
    const part = v.slice(i * BIG_CHUNK, (i + 1) * BIG_CHUNK);
    const n = i ? `${name}_${i}` : name;
    if (part) setCookie(headers, n, part, opts);
    else if (i) clearCookie(headers, n, opts.path);
  }
}
export function getBigCookie(req, name) {
  let v = getCookie(req, name) || "";
  for (let i = 1; i < BIG_PARTS && v; i++) { const part = getCookie(req, `${name}_${i}`); if (!part) break; v += part; }
  return v || null;
}
export function clearBigCookie(headers, name, path) { for (let i = 0; i < BIG_PARTS; i++) clearCookie(headers, i ? `${name}_${i}` : name, path); }
