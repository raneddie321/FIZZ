import { sandboxBrowserEnabled } from "../lib/sandbox-browser.mjs";
import { sandboxEnabled } from "../lib/sandbox.mjs";
import { env, getCookie, json, secretConfigured, unseal } from "../lib/util.mjs";
import { PROVIDERS } from "../lib/providers.mjs";
import { CONNECTORS, cookieFor } from "../lib/connectors.mjs";
import { aiBackend } from "../lib/ai-chat-core.mjs";
import { clerkConfigured, publishableKey } from "../lib/clerk.mjs";
import { searchProvider } from "../lib/web.mjs";
import { kvConfigured } from "../lib/kv.mjs";

/** Public capability check used by the UI: what is configured and what is connected. */
export default async (req) => {
  const secret = secretConfigured();
  const connections = {};
  for (const [id, p] of Object.entries(PROVIDERS)) {
    const session = secret ? unseal(getCookie(req, p.cookie)) : null;
    // GitHub and Vercel can always connect with a personal token; `oauth` says whether the sign-in button is set up.
    connections[id] = { configured: secret, oauth: secret && p.configured(), connected: Boolean(session), account: session?.label ?? null, scopes: session?.scopes ?? [] };
  }
  // Apps connected with the user's own token (names and setup help; never the tokens).
  const apps = Object.entries(CONNECTORS).map(([id, c]) => {
    const saved = secret ? unseal(getCookie(req, cookieFor(id))) : null;
    return { id, name: c.name, desc: c.desc, help: c.help, how: c.how, connected: Boolean(saved), account: saved?.label ?? null };
  });
  return json({
    server: true,
    apps: secret ? apps : [],
    ai: { configured: Boolean(aiBackend(env)), model: aiBackend(env)?.model ?? null, dailyLimit: Number(env("FIZZ_DAILY_LIMIT") || 50) },
    connections,
    // Google uses Google Identity Services in the browser; the client ID is public by design.
    // RanEddie ID (Clerk): the publishable key is public by design; `account` means settings sync works.
    raneddieId: { publishableKey: publishableKey(), account: clerkConfigured() },
    // Fizz Code tools: which ones this deployment can offer.
    tools: { search: searchProvider(), browser: Boolean(env("BROWSERBASE_API_KEY")) || sandboxBrowserEnabled(), browserEngine: env("BROWSERBASE_API_KEY") ? "browserbase" : sandboxBrowserEnabled() ? "sandbox" : null, sandbox: sandboxEnabled() && Boolean(env("VERCEL")), sync: kvConfigured() && clerkConfigured() },
    google: { configured: Boolean(env("GOOGLE_CLIENT_ID")), clientId: env("GOOGLE_CLIENT_ID") ?? null },
  });
};

export const config = { path: "/api/status" };
