import { clearCookie, error, getCookie, json, readJson, sameOrigin, seal, secretConfigured, setCookie, unseal } from "../lib/util.mjs";
import { CONNECTORS, buildRequest, cookieFor } from "../lib/connectors.mjs";

const redactToken = (text, token) => (token ? String(text).split(token).join("••••") : String(text));

/**
 * /api/connector/:service/:action
 *   token      POST { token } — check it with the service, then keep it sealed in a cookie
 *   disconnect POST — forget it
 *   call       POST { method, path, query, body } — call the service's API with the saved token
 */
export default async (req, context) => {
  const { service, action } = context.params;
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
