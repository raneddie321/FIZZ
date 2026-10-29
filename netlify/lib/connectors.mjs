// Apps the user connects with their own token (Settings → Connections → Apps). The token is checked with the
// service once, then kept sealed in an HttpOnly cookie; Fizz Code's calls go through /api/connector, which adds
// the token on the server and only ever talks to that service's own API.
export const CONNECTORS = {
  notion: {
    name: "Notion", desc: "Pages, databases and tasks.",
    help: "https://www.notion.so/profile/integrations", how: "Create a new internal integration, copy its Internal Integration Token, then in Notion open each page you want Fizz to use → ⋯ → Connections → add the integration.",
    base: "https://api.notion.com/v1", headers: (t) => ({ Authorization: `Bearer ${t}`, "Notion-Version": "2022-06-28" }),
    me: { path: "/users/me", label: (j) => j.bot?.workspace_name || j.name || "Notion" },
  },
  trello: {
    name: "Trello", desc: "Boards, lists and cards.",
    help: "https://trello.com/power-ups/admin", how: "Create a Power-Up (any name), open API key → copy the key, then click the Token link next to it and allow. Paste them as KEY:TOKEN.",
    base: "https://api.trello.com/1", query: (t) => ({ key: t.split(":")[0], token: t.split(":")[1] || "" }),
    me: { path: "/members/me", label: (j) => j.fullName || j.username || "Trello" },
  },
  linear: {
    name: "Linear", desc: "Issues and projects (GraphQL: POST /graphql).",
    help: "https://linear.app/settings/account/security", how: "Under Personal API keys, create a key and copy it.",
    base: "https://api.linear.app", headers: (t) => ({ Authorization: t }),
    me: { path: "/graphql", method: "POST", body: { query: "{ viewer { name email } }" }, label: (j) => j.data?.viewer?.email || j.data?.viewer?.name || "Linear", ok: (j) => Boolean(j.data?.viewer) },
  },
  airtable: {
    name: "Airtable", desc: "Bases, tables and records.",
    help: "https://airtable.com/create/tokens", how: "Create a personal access token with data.records:read, data.records:write and schema.bases:read, add the bases Fizz may use, and copy it.",
    base: "https://api.airtable.com/v0", headers: (t) => ({ Authorization: `Bearer ${t}` }),
    me: { path: "/meta/whoami", label: (j) => j.email || "Airtable" },
  },
  figma: {
    name: "Figma", desc: "Read designs, comments and images.",
    help: "https://www.figma.com/settings", how: "Security → Personal access tokens → Generate new token (file content: read; comments: write if you want), copy it.",
    base: "https://api.figma.com/v1", headers: (t) => ({ "X-Figma-Token": t }),
    me: { path: "/me", label: (j) => j.email || j.handle || "Figma" },
  },
  netlify: {
    name: "Netlify", desc: "Sites, deploys and domains.",
    help: "https://app.netlify.com/user/applications#personal-access-tokens", how: "New access token → copy it.",
    base: "https://api.netlify.com/api/v1", headers: (t) => ({ Authorization: `Bearer ${t}` }),
    me: { path: "/user", label: (j) => j.email || j.full_name || "Netlify" },
  },
  cloudflare: {
    name: "Cloudflare", desc: "DNS, Pages, Workers and domains.",
    help: "https://dash.cloudflare.com/profile/api-tokens", how: "Create Token → pick a template (e.g. Edit zone DNS) or custom permissions → copy it.",
    base: "https://api.cloudflare.com/client/v4", headers: (t) => ({ Authorization: `Bearer ${t}` }),
    me: { path: "/user/tokens/verify", label: () => "Cloudflare API token", ok: (j) => j.success !== false && j.result?.status === "active" },
  },
  discord: {
    name: "Discord", desc: "A bot that posts and manages your server.",
    help: "https://discord.com/developers/applications", how: "New Application → Bot → Reset Token → copy it. Then OAuth2 → URL Generator (bot scope) to invite it to your server.",
    base: "https://discord.com/api/v10", headers: (t) => ({ Authorization: `Bot ${t}` }),
    me: { path: "/users/@me", label: (j) => (j.username ? `${j.username} (bot)` : "Discord bot") },
  },
  telegram: {
    name: "Telegram", desc: "A bot that sends you messages and files.",
    help: "https://t.me/BotFather", how: "In Telegram, message @BotFather → /newbot → follow the steps → copy the token. Send your bot a message once so it can write back.",
    base: "https://api.telegram.org", prefix: (t) => `/bot${t}`,
    me: { path: "/getMe", label: (j) => (j.result?.username ? `@${j.result.username}` : "Telegram bot"), ok: (j) => j.ok === true },
  },
  slack: {
    name: "Slack", desc: "Post messages, read channels, search.",
    help: "https://api.slack.com/apps", how: "Create New App → From scratch → OAuth & Permissions → add Bot Token Scopes (chat:write, channels:read, channels:history) → Install to Workspace → copy the Bot User OAuth Token (xoxb-…).",
    base: "https://slack.com/api", headers: (t) => ({ Authorization: `Bearer ${t}` }),
    me: { path: "/auth.test", label: (j) => (j.team ? `${j.user || "bot"} @ ${j.team}` : "Slack"), ok: (j) => j.ok === true },
  },
  brandfetch: {
    name: "Brandfetch", desc: "Search brand identities and find official logos for your projects.",
    help: "https://developers.brandfetch.com/", how: "Create a Brandfetch developer account, generate an API key, then paste it here. Keep the key private.",
    base: "https://api.brandfetch.io/v2", headers: (t) => ({ Authorization: `Bearer ${t}` }),
    me: { path: "/search/brandfetch.com", label: (j) => Array.isArray(j) ? "Brandfetch API key" : (j.name || j.domain || "Brandfetch API key") },
  },
  supabase: {
    name: "Supabase", desc: "Projects, databases and edge functions (Management API).",
    help: "https://supabase.com/dashboard/account/tokens", how: "Generate new token → copy it.",
    base: "https://api.supabase.com/v1", headers: (t) => ({ Authorization: `Bearer ${t}` }),
    me: { path: "/projects", label: (j) => (Array.isArray(j) ? `Supabase (${j.length} project${j.length === 1 ? "" : "s"})` : "Supabase") },
  },
};

export const cookieFor = (id) => `fizz_cx_${id}`;

/** Builds the request to the service. `path` must be a plain API path; the base and auth come from the connector. */
export function buildRequest(c, token, { method = "GET", path = "/", query = {}, body } = {}) {
  const m = String(method).toUpperCase();
  if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(m)) throw Object.assign(new Error(`Unsupported method ${method}.`), { status: 400 });
  const p = String(path || "/");
  if (!p.startsWith("/") || p.includes("://") || p.includes("..") || /[\s#\\]/.test(p) || p.length > 1000) throw Object.assign(new Error("Use a plain API path that starts with / (no full URLs)."), { status: 400 });
  const url = new URL(`${c.base}${c.prefix ? c.prefix(token) : ""}${p}`);
  if (url.origin !== new URL(c.base).origin) throw Object.assign(new Error("That path leaves the service's API."), { status: 400 });
  for (const [k, v] of Object.entries({ ...(query || {}), ...(c.query ? c.query(token) : {}) })) if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  const headers = { Accept: "application/json", "User-Agent": "FIZZ-DEV", ...(c.headers ? c.headers(token) : {}) };
  let payload;
  if (body !== undefined && body !== null && m !== "GET") {
    payload = typeof body === "string" ? body : JSON.stringify(body);
    headers["Content-Type"] = "application/json";
  }
  return { url, init: { method: m, headers, body: payload } };
}
