import { clearCookie, error, getCookie, json, readJson, sameOrigin, seal, secretConfigured, setCookie, unseal } from "../lib/util.mjs";
import { CONNECTORS, buildRequest, cookieFor } from "../lib/connectors.mjs";
import { env } from "../lib/util.mjs";

// ---------- Canva (signed in with OAuth: the token is in the fizz_cv cookie and is refreshed here) ----------
const CANVA_API = "https://api.canva.com/rest/v1";
async function canvaToken(req, headers) {
  const saved = unseal(getCookie(req, "fizz_cv"));
  if (!saved?.t) throw Object.assign(new Error("Canva isn't connected. Connect it in Settings → Connections."), { status: 401, code: "not_connected" });
  if (saved.at && saved.at > Date.now() + 60_000) return saved.t;
  if (!saved.r) throw Object.assign(new Error("The Canva sign-in expired. Connect Canva again."), { status: 401, code: "not_connected" });
  const res = await fetch(`${CANVA_API}/oauth/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${env("CANVA_CLIENT_ID")}:${env("CANVA_CLIENT_SECRET")}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: saved.r }),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok || !d.access_token) throw Object.assign(new Error("The Canva sign-in expired. Connect Canva again."), { status: 401, code: "not_connected" });
  // Canva's refresh tokens are single-use: keep the new one.
  setCookie(headers, "fizz_cv", seal({ ...saved, t: d.access_token, r: d.refresh_token || saved.r, at: Date.now() + (Number(d.expires_in) || 3600) * 1000 }), { maxAge: 60 * 60 * 24 * 30 });
  return d.access_token;
}
const CANVA_PATH = /^\/(users\/me(\/profile)?|designs(\/[\w-]{1,80}(\/(pages|export-formats))?)?|exports(\/[\w-]{1,80})?|asset-uploads(\/[\w-]{1,80})?|assets\/[\w-]{1,80}|folders\/[\w-]{1,80}(\/items)?)$/;
async function canvaCall(req, headers) {
  const body = await readJson(req, 12_000_000);
  const token = await canvaToken(req, headers);
  // An export's download link (Canva's own servers only), handed back as base64 so it can go into the project.
  if (body.download) {
    let u;
    try { u = new URL(String(body.download)); } catch { throw Object.assign(new Error("Invalid link."), { status: 400 }); }
    if (u.protocol !== "https:" || !/(^|\.)canva\.com$|(^|\.)canva-export\.com$|\.amazonaws\.com$|(^|\.)canva\.cn$/.test(u.hostname)) throw Object.assign(new Error("Only Canva's export links can be downloaded."), { status: 400 });
    const r = await fetch(u, { signal: AbortSignal.timeout(25_000) });
    if (!r.ok) throw Object.assign(new Error(`Download failed (${r.status}).`), { status: 502 });
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 8_000_000) throw Object.assign(new Error("The export is larger than 8 MB."), { status: 413 });
    return { ok: true, status: 200, data: { base64: buf.toString("base64"), type: r.headers.get("content-type") || "", size: buf.length } };
  }
  const path = String(body.path || "");
  if (!CANVA_PATH.test(path)) throw Object.assign(new Error("That Canva API path isn't allowed."), { status: 400 });
  const method = ["GET", "POST", "PATCH", "DELETE"].includes(String(body.method || "GET").toUpperCase()) ? String(body.method || "GET").toUpperCase() : "GET";
  const url = new URL(CANVA_API + path);
  for (const [k, v] of Object.entries(body.query || {})) if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  const init = { method, headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(25_000) };
  if (body.upload) {
    // An asset upload: the bytes as the body, the name in a header.
    init.headers["Content-Type"] = "application/octet-stream";
    init.headers["Asset-Upload-Metadata"] = JSON.stringify({ name_base64: Buffer.from(String(body.upload.name || "upload").slice(0, 50)).toString("base64") });
    init.body = Buffer.from(String(body.upload.base64 || ""), "base64");
  } else if (body.body !== undefined && method !== "GET") {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body.body);
  }
  const res = await fetch(url, init);
  const text = await res.text();
  let data = text;
  try { data = JSON.parse(text); } catch {}
  return { ok: res.ok, status: res.status, data: typeof data === "string" ? data.slice(0, 50_000) : data };
}

const redactToken = (text, token) => (token ? String(text).split(token).join("••••") : String(text));

/**
 * /api/connector/:service/:action
 *   token      POST { token } — check it with the service, then keep it sealed in a cookie
 *   disconnect POST — forget it
 *   call       POST { method, path, query, body } — call the service's API with the saved token
 */
export default async (req, context) => {
  const { service, action } = context.params;
  if (service === "canva" && action === "call") {
    if (req.method !== "POST" || !sameOrigin(req)) return error(403, "Not allowed.");
    if (!secretConfigured()) return error(503, "FIZZ_SECRET isn't set on this server.", "not_configured");
    const headers = new Headers();
    try { return json(await canvaCall(req, headers), { headers }); }
    catch (e) { return error(e.status || 502, e.message || "Canva didn't answer.", e.code || "canva_error"); }
  }
  const c = CONNECTORS[service];
  if (!c) return error(404, "Unknown app.");
  if (req.method !== "POST" || !sameOrigin(req)) return error(403, "Not allowed.");
  if (!secretConfigured()) return error(503, "FIZZ_SECRET isn't set on this server.", "not_configured");
  const headers = new Headers();

  if (action === "disconnect") {
    clearCookie(headers, cookieFor(service));
    return json({ ok: true }, { headers });
  }

  if (action === "token") {
    const { token } = await readJson(req, 10_000).catch(() => ({}));
    const t = String(token || "").trim();
    if (t.length < 10 || t.length > 400 || /\s/.test(t)) return error(400, `That doesn't look like a ${c.name} token.`, "bad_token");
    let j = null, res = null;
    try {
      const { url, init } = buildRequest(c, t, { method: c.me.method || "GET", path: c.me.path, body: c.me.body });
      res = await fetch(url, { ...init, signal: AbortSignal.timeout(12_000) });
      j = await res.json().catch(() => null);
    } catch {
      return error(502, `Couldn't reach ${c.name}. Try again.`, "unreachable");
    }
    if (!res.ok || !j || (c.me.ok && !c.me.ok(j))) return error(401, `${c.name} didn't accept this token. Check that you copied all of it and that it has the right permissions.`, "bad_token");
    const label = c.me.label(j);
    setCookie(headers, cookieFor(service), seal({ t, label }), { maxAge: 60 * 60 * 24 * 90 });
    return json({ ok: true, account: label }, { headers });
  }

  if (action === "call") {
    const saved = unseal(getCookie(req, cookieFor(service)));
    if (!saved?.t) return error(401, `${c.name} isn't connected. Connect it in Settings → Connections.`, "not_connected");
    let body;
    try { body = await readJson(req, 2_000_000); } catch (e) { return error(e.status || 400, e.message); }
    let out;
    try {
      const { url, init } = buildRequest(c, saved.t, body);
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(25_000) });
      const text = await res.text();
      let data = text;
      try { data = JSON.parse(text); } catch {}
      out = { status: res.status, ok: res.ok, data: typeof data === "string" ? data.slice(0, 200_000) : data };
    } catch (e) {
      if (e.status) return error(e.status, e.message);
      return error(502, `${c.name} didn't answer in time.`, "unreachable");
    }
    // Never hand the token back, even if a service echoes it (Telegram puts it in URLs).
    return new Response(redactToken(JSON.stringify(out), saved.t), { status: 200, headers: { "content-type": "application/json", "cache-control": "no-store" } });
  }

  return error(404, "Unknown action.");
};

export const config = { path: "/api/connector/:service/:action" };
