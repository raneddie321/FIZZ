/* Fizz Code's tool for the apps the user connected with a token (Notion, Trello, Linear, Airtable, Figma, Netlify,
   Cloudflare, Discord, Telegram, Slack, Supabase). Calls go through FIZZ's server, which adds the token; Fizz Code
   never sees it. Deleting, and sending or posting messages, wait for the user's OK. */
(function () {
  "use strict";
  const F = window.FIZZ;
  const esc = F.esc;
  const apps = () => (F.serverStatusCached?.()?.apps || []);
  const app = (id) => apps().find((a) => a.id === id);

  /** Notes that help the model call each API correctly. */
  const NOTES = {
    notion: "Notion API v1 (Notion-Version is set). Search: POST /search {query}. Create a page: POST /pages {parent:{page_id|database_id}, properties, children}. Append blocks: PATCH /blocks/{id}/children. Query a database: POST /databases/{id}/query. Only pages shared with the integration are visible.",
    trello: "Trello REST v1 (key and token are added). GET /members/me/boards, GET /boards/{id}/lists, POST /cards {idList, name, desc, due}, PUT /cards/{id}.",
    linear: "Linear GraphQL: POST /graphql {query, variables}. Teams: { teams { nodes { id name } } }. Create: mutation { issueCreate(input:{teamId, title, description}) { issue { id url } } }.",
    airtable: "Airtable REST v0. GET /meta/bases, GET /meta/bases/{baseId}/tables, GET /{baseId}/{table}?maxRecords=50, POST /{baseId}/{table} {records:[{fields}]}, PATCH to update.",
    figma: "Figma REST v1. GET /files/{key} (key from the file URL), GET /files/{key}/nodes?ids=…, GET /images/{key}?ids=…&format=png, GET/POST /files/{key}/comments.",
    netlify: "Netlify API v1. GET /sites, GET /sites/{id}/deploys, POST /sites {name}, PATCH /sites/{id}. Deploying project files is easier with the user's Deploy button; prefer reading and settings here.",
    cloudflare: "Cloudflare API v4. GET /zones, GET /zones/{id}/dns_records, POST /zones/{id}/dns_records {type,name,content,proxied}, GET /accounts/{id}/pages/projects. Changes to DNS wait for the user's OK.",
    discord: "Discord API v10 as a bot. GET /users/@me/guilds, GET /guilds/{id}/channels, POST /channels/{id}/messages {content}. Sending waits for the user's OK.",
    telegram: "Telegram Bot API (the token is added). GET /getUpdates to find the user's chat id (after they message the bot), POST /sendMessage {chat_id, text, parse_mode:'HTML'}. Sending waits for the user's OK.",
    slack: "Slack Web API with a bot token. GET /conversations.list, GET /conversations.history?channel=…, POST /chat.postMessage {channel, text}, GET /search.messages?query=… (needs a user token). Posting waits for the user's OK.",
    supabase: "Supabase Management API v1. GET /projects, GET /projects/{ref}/api-keys, POST /projects/{ref}/database/query {query} (runs SQL — destructive SQL waits for the user's OK), GET /projects/{ref}/functions.",
  };
  const MESSAGING = { telegram: /\/send|\/forward|\/copy/i, discord: /\/messages|\/webhooks/i, slack: /chat\.(postMessage|update|delete|scheduleMessage)|files\.upload|reactions\.add/i };
  const DESTRUCTIVE_SQL = /\b(drop|delete|truncate|alter|update|insert|grant|revoke)\b/i;
  function risky(t) {
    const method = String(t.attrs.method || "GET").toUpperCase();
    const path = t.attrs.path || "";
    if (method === "DELETE") return "delete";
    if (method === "GET") return "";
    if (MESSAGING[t.attrs.service]?.test(path)) return "send";
    if (t.attrs.service === "cloudflare") return "change";
    if (t.attrs.service === "supabase" && /database\/query/.test(path) && DESTRUCTIVE_SQL.test(t.body || "")) return "change";
    return "";
  }
  const parseBody = (t) => {
    const raw = String(t.body || "").trim();
    if (!raw) return undefined;
    try { return JSON.parse(raw); } catch { return raw; }
  };

  F.agentTools.register("api", {
    icon: "plug", feedback: true,
    label: (t) => `${app(t.attrs.service)?.name || t.attrs.service}: ${String(t.attrs.method || "GET").toUpperCase()} ${t.attrs.path || "/"}`,
    summary: (k) => `called connected apps ${k}×`,
    get prompt() {
      const on = apps().filter((a) => a.connected);
      if (!on.length) return "";
      return [
        '<fizz-api service="…" method="GET|POST|PUT|PATCH|DELETE" path="/api/path" query=\'{"k":"v"}\'>JSON body</fizz-api> calls an app the user connected; FIZZ adds their token. Connected now:',
        ...on.map((a) => `  ${a.id} (${a.account || a.name}): ${NOTES[a.id] || ""}`),
        ...(apps().some((a) => !a.connected) ? [`  Not connected yet (the user can connect them in Settings → Connections → Apps): ${apps().filter((a) => !a.connected).map((a) => a.name).join(", ")}.`] : []),
        "  You get the status and the JSON back. Read before you write (find the right ids first). Deleting, sending/posting messages and DNS changes wait for the user's OK automatically.",
      ].join("\n");
    },
    available: () => apps().some((a) => a.connected),
    unavailable: "Apps like Notion, Trello, Linear, Airtable, Figma, Netlify, Cloudflare, Discord, Telegram, Slack and Supabase can be connected in Settings → Connections → Apps. If the user asks for one that isn't connected, tell them that in one sentence.",
    needsApproval: (t) => Boolean(risky(t)),
    waiting: (t) => {
      const kind = risky(t);
      const name = app(t.attrs.service)?.name || t.attrs.service;
      const what = { delete: `delete something in ${name}`, send: `send a message with ${name}`, change: `change settings in ${name}` }[kind];
      return { text: `Fizz Code wants to ${what}: ${String(t.attrs.method || "").toUpperCase()} ${t.attrs.path}${t.body ? ` — ${String(t.body).slice(0, 240)}${String(t.body).length > 240 ? "…" : ""}` : ""}`, ok: kind === "send" ? "Send" : "Allow", cancel: "Don't" };
    },
    async run(t) {
      const a = app(t.attrs.service);
      if (!a) return { ok: false, text: `Unknown app "${t.attrs.service}". Connected apps: ${apps().filter((x) => x.connected).map((x) => x.id).join(", ") || "none"}.` };
      if (!a.connected) return { ok: false, text: `${a.name} isn't connected. Ask the user to connect it in Settings → Connections → Apps.` };
      let query;
      if (t.attrs.query) { try { query = JSON.parse(t.attrs.query); } catch { return { ok: false, text: 'query must be JSON, like query=\'{"limit":10}\'.' }; } }
      try {
        const r = await F.conn.apps.call(a.id, { method: t.attrs.method || "GET", path: t.attrs.path || "/", query, body: parseBody(t) });
        const text = typeof r.data === "string" ? r.data : JSON.stringify(r.data, null, 1);
        return { ok: r.ok, text: `${a.name} answered ${r.status}${r.ok ? "" : " (error)"}:\n${text.slice(0, 14000)}${text.length > 14000 ? "\n…(cut)" : ""}`, html: `<pre class="out">${esc(text.slice(0, 3000))}</pre>` };
      } catch (e) {
        return { ok: false, text: e.message || String(e) };
      }
    },
  });
})();
