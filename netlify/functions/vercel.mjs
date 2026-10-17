import { error, getCookie, json, normalizePath, readJson, sameOrigin, seal, setCookie, unseal } from "../lib/util.mjs";
import { vercelToken } from "../lib/providers.mjs";

const API = "https://api.vercel.com";

async function vc(token, path, init = {}) {
  const res = await fetch(`${API}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.body ? { "Content-Type": "application/json" } : {}) } });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw Object.assign(new Error(data?.error?.message || `Vercel error ${res.status}`), { status: res.status, code: data?.error?.code });
  return data;
}

export default async (req, context) => {
  let session = unseal(getCookie(req, "fizz_vc"));
  if (!session) return error(401, "Connect Vercel first.", "not_connected");
  if (!sameOrigin(req)) return error(403, "Not allowed.");
  const headers = new Headers();
  // Access tokens last about an hour; refresh with the stored refresh token when needed.
  if (session.at && session.at < Date.now() + 60_000 && session.r) {
    try {
      session = { ...(await vercelToken({ grant_type: "refresh_token", refresh_token: session.r })), label: session.label };
      setCookie(headers, "fizz_vc", seal(session));
    } catch {
      return error(401, "Your Vercel connection expired. Connect Vercel again.", "not_connected");
    }
  }
  try {
    if (context.params.action === "deploy") {
      const body = await readJson(req);
      const name = String(body.name || "").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 52) || "fizz-project";
      const files = [];
      for (const [path, content] of Object.entries(body.files || {})) {
        const p = normalizePath(path);
        if (!p) return error(400, `Invalid file path: ${path}`);
        // Binary files (images, PDFs, documents) arrive as { base64 }.
        if (content && typeof content === "object" && typeof content.base64 === "string") files.push({ file: p, data: content.base64, encoding: "base64" });
        else files.push({ file: p, data: String(content) });
      }
      if (!files.length) return error(400, "This project has no files to deploy.");
      const d = await vc(session.t, "/v13/deployments", {
        method: "POST",
        body: JSON.stringify({ name, files, target: body.production ? "production" : undefined, projectSettings: { framework: null } }),
      });
      return json({ id: d.id, url: `https://${d.url}`, state: d.readyState ?? d.status, inspectorUrl: d.inspectorUrl ?? null }, { headers });
    }
    if (context.params.action === "deployment") {
      const id = new URL(req.url).searchParams.get("id");
      if (!id || !/^[A-Za-z0-9_]+$/.test(id)) return error(400, "Invalid deployment id.");
      const d = await vc(session.t, `/v13/deployments/${id}`);
      return json({ id: d.id, url: `https://${d.url}`, alias: d.alias?.[0] ? `https://${d.alias[0]}` : null, state: d.readyState ?? d.status, error: d.errorMessage ?? null }, { headers });
    }
    return error(404, "Unknown action.");
  } catch (e) {
    if (e.status === 401) return error(401, "Your Vercel connection expired. Connect Vercel again.", "not_connected");
    if (e.status === 403) return error(403, session.kind === "token" ? "Vercel refused this action. Make a token with access to your account (Scope: your personal account or team) and connect again." : "Vercel refused this action — the sign-in doesn't allow deployments. Disconnect Vercel and connect with a token instead (Settings → Connections).", "forbidden");
    return error(e.status && e.status < 500 ? e.status : 502, e.message, "vercel_error");
  }
};

export const config = { path: "/api/vercel/:action" };
