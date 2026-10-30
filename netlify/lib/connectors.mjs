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
  dropbox: { name: "Dropbox", desc: "Files and folders.", help: "https://www.dropbox.com/developers/apps", how: "Create an app and generate an access token.", base: "https://api.dropboxapi.com/2", headers: (t) => ({ Authorization: `Bearer ${t}` }), me: { path: "/users/get_current_account", method: "POST", body: {}, label: (j) => j.name?.display_name || j.email || 'Dropbox' } },
  asana: { name: "Asana", desc: "Projects and tasks.", help: "https://app.asana.com/0/my-apps", how: "Create a personal access token.", base: "https://app.asana.com/api/1.0", headers: (t) => ({ Authorization: `Bearer ${t}` }), me: { path: "/users/me", label: (j) => j.data?.name || j.data?.email || 'Asana' } },
  monday: { name: "monday.com", desc: "Boards and workspaces.", help: "https://developer.monday.com/", how: "Generate an API token in your developer settings.", base: "https://api.monday.com/v2", headers: (t) => ({ Authorization: t }), me: { path: "/", method: "POST", body: { query: "{ me { name email } }" }, label: (j) => j.data?.me?.name || j.data?.me?.email || 'monday.com', ok: (j) => Boolean(j.data?.me) } },
  clickup: { name: "ClickUp", desc: "Tasks and lists.", help: "https://app.clickup.com/settings/apps", how: "Copy your personal API token.", base: "https://api.clickup.com/api/v2", headers: (t) => ({ Authorization: `Bearer ${t}` }), me: { path: "/user", label: (j) => j.user?.username || j.user?.email || 'ClickUp' } },
  todoist: { name: "Todoist", desc: "Tasks and projects.", help: "https://todoist.com/app/settings/integrations", how: "Copy your API token from Integrations settings.", base: "https://api.todoist.com/rest/v2", headers: (t) => ({ Authorization: `Bearer ${t}` }), me: { path: "/projects", label: (j) => 'Todoist' } },
  hubspot: { name: "HubSpot", desc: "CRM contacts and deals.", help: "https://developers.hubspot.com/", how: "Create a private app and copy its access token.", base: "https://api.hubapi.com", headers: (t) => ({ Authorization: `Bearer ${t}` }), me: { path: "/account-info/v3/details", label: (j) => j.portalId || 'HubSpot' } },
  intercom: { name: "Intercom", desc: "Customer conversations.", help: "https://developers.intercom.com/", how: "Create an access token in your workspace developer settings.", base: "https://api.intercom.io", headers: (t) => ({ Authorization: `Bearer ${t}` }), me: { path: "/me", label: (j) => j.name || j.app?.name || 'Intercom' } },
  sendgrid: { name: "SendGrid", desc: "Email delivery.", help: "https://app.sendgrid.com/settings/api_keys", how: "Create an API key with minimum required mail permissions.", base: "https://api.sendgrid.com/v3", headers: (t) => ({ Authorization: `Bearer ${t}` }), me: { path: "/scopes", label: (j) => 'SendGrid API key', ok: (j) => Array.isArray(j.scopes) } },
  resend: { name: "Resend", desc: "Transactional email.", help: "https://resend.com/api-keys", how: "Create an API key and copy it.", base: "https://api.resend.com", headers: (t) => ({ Authorization: `Bearer ${t}` }), me: { path: "/api-keys", label: (j) => 'Resend API key', ok: (j) => Array.isArray(j.data) } },
  postmark: { name: "Postmark", desc: "Email streams.", help: "https://account.postmarkapp.com/servers", how: "Copy a server API token.", base: "https://api.postmarkapp.com", headers: (t) => ({ 'X-Postmark-Server-Token': t }), me: { path: "/server", label: (j) => j.Name || 'Postmark', ok: (j) => Boolean(j.ID) } },
  algolia: { name: "Algolia", desc: "Search indices.", help: "https://www.algolia.com/account/api-keys/", how: "Create a restricted API key.", base: "https://api.algolia.com/1", headers: (t) => ({ 'X-Algolia-API-Key': t }), me: { path: "/keys", label: (j) => 'Algolia API key' } },
  openai: { name: "OpenAI", desc: "Models and platform API.", help: "https://platform.openai.com/api-keys", how: "Create a project API key.", base: "https://api.openai.com/v1", headers: (t) => ({ Authorization: `Bearer ${t}` }), me: { path: "/models", label: (j) => 'OpenAI API key' } },
  huggingface: { name: "Hugging Face", desc: "Models and datasets.", help: "https://huggingface.co/settings/tokens", how: "Create a fine-grained token.", base: "https://huggingface.co", headers: (t) => ({ Authorization: `Bearer ${t}` }), me: { path: "/api/whoami-v2", label: (j) => j.name || j.email || 'Hugging Face' } },
  replicate: { name: "Replicate", desc: "Hosted AI models.", help: "https://replicate.com/account/api-tokens", how: "Copy your API token.", base: "https://api.replicate.com/v1", headers: (t) => ({ Authorization: `Bearer ${t}` }), me: { path: "/account", label: (j) => j.username || 'Replicate' } },
  elevenlabs: { name: "ElevenLabs", desc: "Text-to-speech and voices.", help: "https://elevenlabs.io/app/settings/api-keys", how: "Create an API key.", base: "https://api.elevenlabs.io/v1", headers: (t) => ({ 'xi-api-key': t }), me: { path: "/user", label: (j) => j.email || 'ElevenLabs' } },
  shopify: { name: "Shopify", desc: "Store products and orders.", help: "https://shopify.dev/docs/apps", how: "Create a custom app and copy its Admin API access token.", base: "https://YOUR-STORE.myshopify.com/admin/api/2025-10", headers: () => ({}), me: { path: "/shop.json", label: (j) => j.shop?.name || 'Shopify', ok: (j) => Boolean(j.shop) } },
  jira: { name: "Jira", desc: "Issues and projects.", help: "https://id.atlassian.com/manage-profile/security/api-tokens", how: "Paste Atlassian email:API-token. Set the Jira site URL before using calls.", base: "https://YOUR-DOMAIN.atlassian.net/rest/api/3", headers: (t) => ({ Authorization: `Basic ${Buffer.from(t).toString('base64')}` }), me: { path: "/myself", label: (j) => j.displayName || j.emailAddress || 'Jira', ok: (j) => Boolean(j.accountId) } },
  paypal: { name: "PayPal", desc: "PayPal REST API.", help: "https://developer.paypal.com/dashboard/applications", how: "Paste Client ID:Secret from a REST app (sandbox/live credentials).", base: "https://api-m.paypal.com", headers: (t) => ({ Authorization: `Basic ${Buffer.from(t).toString('base64')}` }), me: { path: "/v1/oauth2/token", method: "POST", body: 'grant_type=client_credentials', label: (j) => j.app_id || 'PayPal app', ok: (j) => Boolean(j.access_token) } },
  stripe: { name: "Stripe", desc: "Payments and account details.", help: "https://dashboard.stripe.com/apikeys", how: "Use an sk_ or restricted rk_ API key.", base: "https://api.stripe.com/v1", headers: (t) => ({ Authorization: `Bearer ${t}` }), me: { path: "/account", label: (j) => j.business_profile?.name || j.id || 'Stripe' } },
  pusher: { name: "Pusher", desc: "Realtime events.", help: "https://dashboard.pusher.com/", how: "Create an app; provide a server API token.", base: "https://api-mgmt.pusher.com", headers: (t) => ({ Authorization: `Bearer ${t}` }), me: { path: "/", label: (j) => 'Pusher API token' } },
  googlemaps: { name: "Google Maps Platform", desc: "Maps and places APIs.", help: "https://console.cloud.google.com/google/maps-apis/credentials", how: "Create and restrict an API key.", base: "https://maps.googleapis.com/maps/api", headers: () => ({}), me: { path: "/geocode/json", label: (j) => 'Google Maps API key', query: { address: '1600 Amphitheatre Parkway' }, ok: (j) => ['OK','ZERO_RESULTS'].includes(j.status) } },
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
  for (const [k, v] of Object.entries({ ...(c.me?.query || {}), ...(query || {}), ...(c.query ? c.query(token) : {}) })) if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  const headers = { Accept: "application/json", "User-Agent": "FIZZ-DEV", ...(c.headers ? c.headers(token) : {}) };
  let payload;
  if (body !== undefined && body !== null && m !== "GET") {
    payload = typeof body === "string" ? body : JSON.stringify(body);
    headers["Content-Type"] = typeof body === "string" ? "application/x-www-form-urlencoded" : "application/json";
  }
  return { url, init: { method: m, headers, body: payload } };
}
