import { env, getCookie, json, secretConfigured, unseal } from "../lib/util.mjs";
import { PROVIDERS } from "../lib/providers.mjs";

/** Public capability check used by the UI: what is configured and what is connected. */
export default async (req) => {
  const secret = secretConfigured();
  const connections = {};
  for (const [id, p] of Object.entries(PROVIDERS)) {
    const session = secret ? unseal(getCookie(req, p.cookie)) : null;
    connections[id] = { configured: secret && p.configured(), connected: Boolean(session), account: session?.label ?? null, scopes: session?.scopes ?? [] };
  }
  return json({
    server: true,
    ai: { configured: Boolean(env("OPENROUTER_API_KEY")), model: env("FIZZ_DEFAULT_MODEL") || "z-ai/glm-4.6", dailyLimit: Number(env("FIZZ_DAILY_LIMIT") || 50) },
    connections,
    // Google uses Google Identity Services in the browser; the client ID is public by design.
    google: { configured: Boolean(env("GOOGLE_CLIENT_ID")), clientId: env("GOOGLE_CLIENT_ID") ?? null },
  });
};

export const config = { path: "/api/status" };
