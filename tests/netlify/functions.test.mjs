// Run: node tests/netlify/functions.test.mjs  (uses fake credentials only)
import assert from "node:assert/strict";
process.env.FIZZ_SECRET = "test-secret-test-secret-test-secret-123";
process.env.GITHUB_CLIENT_ID = "gh_fake_id";
process.env.GITHUB_CLIENT_SECRET = "gh_fake_secret";
process.env.VERCEL_CLIENT_ID = "cl_fake";
process.env.VERCEL_CLIENT_SECRET = "vc_fake_secret";
process.env.GOOGLE_CLIENT_ID = "fake.apps.googleusercontent.com";

const status = (await import("../../netlify/functions/status.mjs")).default;
const oauth = (await import("../../netlify/functions/oauth.mjs")).default;
const github = (await import("../../netlify/functions/github.mjs")).default;
const vercel = (await import("../../netlify/functions/vercel.mjs")).default;
const { seal, unseal } = await import("../../netlify/lib/util.mjs");
const O = "https://fizz.example";

// status: configured, not connected, no secrets leaked
let r = await status(new Request(`${O}/api/status`));
let j = await r.json();
assert.equal(j.connections.github.configured, true);
assert.equal(j.connections.github.connected, false);
assert.equal(j.google.clientId, "fake.apps.googleusercontent.com");
assert.ok(!JSON.stringify(j).includes("secret"), "status must not leak secrets");

// status: connected via sealed cookie
const ghCookie = seal({ t: "tok", label: "@octo", scopes: ["repo"] });
r = await status(new Request(`${O}/api/status`, { headers: { cookie: `fizz_gh=${encodeURIComponent(ghCookie)}` } }));
j = await r.json();
assert.equal(j.connections.github.connected, true);
assert.equal(j.connections.github.account, "@octo");
assert.ok(!JSON.stringify(j).includes("tok\""), "token must not be returned");

// tampered cookie is rejected
assert.equal(unseal(ghCookie.slice(0, -2) + "xx"), null);

// oauth start github
r = await oauth(new Request(`${O}/api/oauth/github/start`), { params: { provider: "github", action: "start" } });
assert.equal(r.status, 302);
const loc = new URL(r.headers.get("location"));
assert.equal(loc.host, "github.com");
assert.equal(loc.searchParams.get("client_id"), "gh_fake_id");
assert.equal(loc.searchParams.get("redirect_uri"), `${O}/api/oauth/github/callback`);
assert.match(r.headers.get("set-cookie"), /fizz_oauth=.*HttpOnly; Secure; SameSite=Lax/);

// oauth start vercel uses PKCE
r = await oauth(new Request(`${O}/api/oauth/vercel/start`), { params: { provider: "vercel", action: "start" } });
const vloc = new URL(r.headers.get("location"));
assert.equal(vloc.origin + vloc.pathname, "https://vercel.com/oauth/authorize");
assert.equal(vloc.searchParams.get("code_challenge_method"), "S256");
assert.ok(vloc.searchParams.get("code_challenge"));

// callback with wrong state -> redirected with error, no session cookie
r = await oauth(new Request(`${O}/api/oauth/github/callback?code=x&state=wrong`), { params: { provider: "github", action: "callback" } });
assert.equal(r.status, 302);
assert.match(r.headers.get("location"), /connect_error=github/);
assert.ok(!/fizz_gh=[^;]/.test(r.headers.get("set-cookie") || ""));

// disconnect requires POST + same origin
r = await oauth(new Request(`${O}/api/oauth/github/disconnect`, { method: "POST", headers: { origin: "https://evil.example" } }), { params: { provider: "github", action: "disconnect" } });
assert.equal(r.status, 403);
r = await oauth(new Request(`${O}/api/oauth/github/disconnect`, { method: "POST", headers: { origin: O } }), { params: { provider: "github", action: "disconnect" } });
assert.equal(r.status, 200);
assert.match(r.headers.get("set-cookie"), /fizz_gh=; Path=\/api; Max-Age=0/);

// provider APIs require a connection
r = await github(new Request(`${O}/api/github/repos`), { params: { action: "repos" } });
assert.equal(r.status, 401);
r = await vercel(new Request(`${O}/api/vercel/deploy`, { method: "POST", headers: { origin: O }, body: "{}" }), { params: { action: "deploy" } });
assert.equal(r.status, 401);

// cross-site POST rejected even with a session
r = await github(new Request(`${O}/api/github/push`, { method: "POST", headers: { origin: "https://evil.example", cookie: `fizz_gh=${encodeURIComponent(ghCookie)}` }, body: "{}" }), { params: { action: "push" } });
assert.equal(r.status, 403);

// input validation on push
r = await github(new Request(`${O}/api/github/push`, { method: "POST", headers: { origin: O, cookie: `fizz_gh=${encodeURIComponent(ghCookie)}` }, body: JSON.stringify({ owner: "a/b", repo: "x", branch: "main", files: {} }) }), { params: { action: "push" } });
assert.equal(r.status, 400);

// not configured -> 503
delete process.env.VERCEL_CLIENT_SECRET;
r = await oauth(new Request(`${O}/api/oauth/vercel/start`), { params: { provider: "vercel", action: "start" } });
assert.equal(r.status, 503);

// ---------- Vercel entry points (api/) run the same handlers ----------
process.env.VERCEL_CLIENT_SECRET = "vc_fake_secret";
const vStatus = await import("../../api/status.mjs");
const vOauth = await import("../../api/oauth/[provider]/[action].mjs");
const vGithub = await import("../../api/github/[action].mjs");
const vAi = await import("../../api/ai/chat.mjs");
r = await vStatus.GET(new Request(`${O}/api/status`, { headers: { cookie: `fizz_gh=${encodeURIComponent(ghCookie)}` } }));
j = await r.json();
assert.equal(j.server, true);
assert.equal(j.connections.github.account, "@octo");
r = await vOauth.GET(new Request(`${O}/api/oauth/github/start`));
assert.equal(r.status, 302);
assert.equal(new URL(r.headers.get("location")).searchParams.get("redirect_uri"), `${O}/api/oauth/github/callback`);
r = await vOauth.GET(new Request(`${O}/api/oauth/vercel/start`));
assert.equal(r.status, 302);
assert.ok(new URL(r.headers.get("location")).searchParams.get("code_challenge"));
r = await vOauth.GET(new Request(`${O}/api/oauth/[provider]/[action].mjs?provider=github&action=start`));
assert.equal(r.status, 302, "rewritten Vercel URL uses query params");
r = await vOauth.GET(new Request(`${O}/api/oauth/nope/start`));
assert.equal(r.status, 404);
r = await vGithub.GET(new Request(`${O}/api/github/repos`));
assert.equal(r.status, 401);

// AI proxy on Vercel: not configured, then streams with an in-memory quota
r = await vAi.POST(new Request(`${O}/api/ai/chat`, { method: "POST", headers: { origin: O }, body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }) }));
assert.equal(r.status, 503);
process.env.OPENROUTER_API_KEY = "sk-or-fake";
process.env.FIZZ_DAILY_LIMIT = "2";
const realFetch = globalThis.fetch;
let upstreamAuth = null;
globalThis.fetch = async (url, init) => {
  assert.equal(String(url), "https://openrouter.ai/api/v1/chat/completions");
  upstreamAuth = init.headers.Authorization;
  return new Response("data: [DONE]\n\n", { headers: { "content-type": "text/event-stream" } });
};
const ask = () => vAi.POST(new Request(`${O}/api/ai/chat`, { method: "POST", headers: { origin: O, cookie: "fizz_uid=abcdefghijklmnop1234", "x-forwarded-for": "1.2.3.4" }, body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }) }));
r = await ask(); assert.equal(r.status, 200); assert.equal(await r.text(), "data: [DONE]\n\n");
assert.equal(upstreamAuth, "Bearer sk-or-fake");
r = await ask(); assert.equal(r.status, 200);
r = await ask(); assert.equal(r.status, 429, "daily quota enforced");
r = await vAi.POST(new Request(`${O}/api/ai/chat`, { method: "POST", headers: { origin: "https://evil.example" }, body: "{}" }));
assert.equal(r.status, 403);
globalThis.fetch = realFetch;

// Google AI Studio key: used through Gemini's OpenAI-compatible endpoint when no OpenRouter key is set
delete process.env.OPENROUTER_API_KEY;
process.env.GEMINI_API_KEY = "AIza-fake";
process.env.FIZZ_DAILY_LIMIT = "100";
let gemini = null;
globalThis.fetch = async (url, init) => { gemini = { url: String(url), auth: init.headers.Authorization, model: JSON.parse(init.body).model }; return new Response("data: [DONE]\n\n"); };
r = await vAi.POST(new Request(`${O}/api/ai/chat`, { method: "POST", headers: { origin: O, cookie: "fizz_uid=qrstuvwxyz12345678", "x-forwarded-for": "5.6.7.8" }, body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }) }));
assert.equal(r.status, 200);
assert.deepEqual(gemini, { url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", auth: "Bearer AIza-fake", model: "gemini-3.8-flash" });
// busy model: retried, then falls back to FIZZ_FALLBACK_MODELS
process.env.FIZZ_FALLBACK_MODELS = "backup-model";
const tried = [];
globalThis.fetch = async (url, init) => { const m = JSON.parse(init.body).model; tried.push(m); return m === "backup-model" ? new Response("data: [DONE]\n\n") : new Response('{"error":{"message":"high demand"}}', { status: 503 }); };
r = await vAi.POST(new Request(`${O}/api/ai/chat`, { method: "POST", headers: { origin: O, cookie: "fizz_uid=qrstuvwxyz12345678", "x-forwarded-for": "5.6.7.8" }, body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }) }));
assert.equal(r.status, 200);
assert.deepEqual(tried, ["gemini-3.8-flash", "gemini-3.8-flash", "backup-model"]);
delete process.env.FIZZ_FALLBACK_MODELS;
globalThis.fetch = realFetch;
j = await (await vStatus.GET(new Request(`${O}/api/status`))).json();
assert.equal(j.ai.configured, true);
assert.equal(j.ai.model, "gemini-3.8-flash");

// ---------- RanEddie ID (Clerk): token verification and privateMetadata.fizz merge ----------
{
  const { generateKeyPairSync, sign } = await import("node:crypto");
  const vAccount = await import("../../api/account.mjs");
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: "jwk" }), kid: "ins_test", alg: "RS256", use: "sig" };
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const jwt = (payload, kid = "ins_test", key = privateKey) => {
    const h = b64({ alg: "RS256", kid, typ: "JWT" }), p = b64(payload);
    return `${h}.${p}.${sign("RSA-SHA256", Buffer.from(`${h}.${p}`), key).toString("base64url")}`;
  };
  const now = Math.floor(Date.now() / 1000);
  const good = jwt({ sub: "user_abc", azp: O, exp: now + 60, nbf: now - 5 });

  r = await vAccount.GET(new Request(`${O}/api/account`, { headers: { authorization: `Bearer ${good}` } }));
  assert.equal(r.status, 503, "not configured without CLERK_SECRET_KEY");
  process.env.CLERK_SECRET_KEY = "sk_test_fake";
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "pk_test_fake";
  j = await (await vStatus.GET(new Request(`${O}/api/status`))).json();
  assert.deepEqual(j.raneddieId, { publishableKey: "pk_test_fake", account: true });

  // The user already has Snake Brawl data (about 6 KB) that must survive every FIZZ write.
  let meta = { snakeBrawlSave: "x".repeat(6000), snakeBrawlSaveAt: 123, gameTokenVersion: 2 };
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    url = String(url);
    calls.push(`${init.method || "GET"} ${url.replace("https://api.clerk.com/v1", "")}`);
    assert.equal(init.headers.Authorization, "Bearer sk_test_fake");
    if (url.endsWith("/jwks")) return Response.json({ keys: [jwk] });
    if (url.endsWith("/users/user_abc/metadata")) {
      const body = JSON.parse(init.body);
      assert.deepEqual(Object.keys(body), ["private_metadata"]);
      assert.deepEqual(Object.keys(body.private_metadata), ["fizz"], "only the fizz key is sent");
      meta = { ...meta, ...body.private_metadata }; // Clerk merges
      return Response.json({ id: "user_abc" });
    }
    if (url.endsWith("/users/user_abc")) return Response.json({ id: "user_abc", private_metadata: meta, public_metadata: { snakeBrawl: { level: 9 } } });
    return new Response("{}", { status: 404 });
  };
  const call = (method, token, body, origin = O) => vAccount[method](new Request(`${O}/api/account`, { method, headers: { authorization: `Bearer ${token}`, origin, "content-type": "application/json" }, body: body && JSON.stringify(body) }));

  r = await call("GET", good); assert.equal(r.status, 200); assert.deepEqual(await r.json(), { fizz: null });
  r = await call("PUT", good, { fizz: { theme: "dark", model: "claude-opus-5-5", devMode: "ask", at: 1700000000000, apiKey: "sk-ant-secret", evil: "x" } });
  assert.equal(r.status, 200);
  assert.deepEqual((await r.json()).fizz, { theme: "dark", model: "claude-opus-5-5", devMode: "ask", at: 1700000000000 }, "unknown keys and API keys are dropped");
  assert.equal(meta.snakeBrawlSave.length, 6000); assert.equal(meta.snakeBrawlSaveAt, 123); assert.equal(meta.gameTokenVersion, 2);
  assert.ok(calls.indexOf("GET /users/user_abc") < calls.indexOf("PATCH /users/user_abc/metadata"), "reads before writing");
  r = await call("GET", good); assert.deepEqual((await r.json()).fizz.theme, "dark");

  // no room left: metadata would pass 8 KB
  meta.snakeBrawlSave = "x".repeat(8150);
  r = await call("PUT", good, { fizz: { theme: "light" } }); assert.equal(r.status, 507);
  assert.equal(meta.fizz.theme, "dark", "nothing written when over the limit");
  meta.snakeBrawlSave = "x".repeat(6000);

  // rejected tokens
  const other = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey;
  for (const [why, t] of [
    ["expired", jwt({ sub: "user_abc", azp: O, exp: now - 60 })],
    ["wrong site", jwt({ sub: "user_abc", azp: "https://evil.example", exp: now + 60 })],
    ["bad signature", jwt({ sub: "user_abc", azp: O, exp: now + 60 }, "ins_test", other)],
    ["unknown key", jwt({ sub: "user_abc", azp: O, exp: now + 60 }, "ins_other")],
    ["garbage", "not.a.jwt"],
  ]) { r = await call("GET", t); assert.equal(r.status, 401, why); }
  r = await call("PUT", good, { fizz: { theme: "dark" } }, "https://evil.example"); assert.equal(r.status, 403, "cross-site write blocked");
  globalThis.fetch = realFetch;
}

// token connections (no OAuth app needed): validated with the provider, then sealed in the cookie
{
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const auth = init?.headers?.Authorization || "";
    if (String(url) === "https://api.vercel.com/v2/user") return auth === "Bearer vtok_good_1234567890abcd" ? Response.json({ user: { email: "me@example.com" } }) : new Response("{}", { status: 403 });
    if (String(url) === "https://api.github.com/user") return auth.includes("ghp_goodgoodgoodgoodgood1234") ? Response.json({ login: "octo" }, { headers: { "x-oauth-scopes": "repo, workflow" } }) : auth.includes("ghp_noscopenoscopenoscope12") ? Response.json({ login: "octo" }, { headers: { "x-oauth-scopes": "read:user" } }) : new Response("{}", { status: 401 });
    return realFetch(url, init);
  };
  const post = (provider, token, origin = O) => oauth(new Request(`${O}/api/oauth/${provider}/token`, { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ token }) }), { params: { provider, action: "token" } });
  r = await post("vercel", "vtok_good_1234567890abcd");
  assert.equal(r.status, 200);
  const vc = decodeURIComponent(/fizz_vc=([^;]+)/.exec(r.headers.get("set-cookie"))[1]);
  assert.equal(unseal(vc).label, "me@example.com");
  assert.equal(unseal(vc).kind, "token");
  assert.equal((await post("vercel", "vtok_bad_1234567890abcdef")).status, 401);
  assert.equal((await post("vercel", "x")).status, 400);
  assert.equal((await post("vercel", "vtok_good_1234567890abcd", "https://evil.example")).status, 403);
  r = await post("github", "ghp_goodgoodgoodgoodgood1234");
  assert.equal(r.status, 200);
  assert.equal(unseal(decodeURIComponent(/fizz_gh=([^;]+)/.exec(r.headers.get("set-cookie"))[1])).label, "@octo");
  r = await post("github", "ghp_noscopenoscopenoscope12");
  assert.equal(r.status, 400);
  assert.match((await r.json()).error.message, /repo.*workflow/);
  assert.equal((await post("github", "ghp_wrongwrongwrongwrong123")).status, 401);
  globalThis.fetch = realFetch;
}
// connectors: token checked with the service, sealed; calls only go to that service, token never returned
{
  const connector = (await import("../../netlify/functions/connector.mjs")).default;
  const realFetch = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (url, init) => {
    const u = String(url); seen.push(u);
    if (u === "https://api.notion.com/v1/users/me") return init.headers.Authorization === "Bearer secret_goodgoodgood" ? Response.json({ bot: { workspace_name: "Eddie WS" } }) : new Response("{}", { status: 401 });
    if (u.startsWith("https://api.notion.com/v1/search")) return Response.json({ results: [{ id: "p1" }], echo: init.headers.Authorization });
    if (u.startsWith("https://api.telegram.org/botTG:tok_abcdefgh/getMe")) return Response.json({ ok: true, result: { username: "fizzbot" } });
    if (u.startsWith("https://api.telegram.org/botTG:tok_abcdefgh/sendMessage")) return Response.json({ ok: true, url: u });
    return realFetch(url, init);
  };
  const call = (service, action, body, cookie, origin = O) => connector(new Request(`${O}/api/connector/${service}/${action}`, { method: "POST", headers: { origin, "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body || {}) }), { params: { service, action } });
  r = await call("notion", "token", { token: "secret_goodgoodgood" });
  assert.equal(r.status, 200);
  const nc = /fizz_cx_notion=([^;]+)/.exec(r.headers.get("set-cookie"))[1];
  assert.equal(unseal(decodeURIComponent(nc)).label, "Eddie WS");
  assert.equal((await call("notion", "token", { token: "secret_badbadbadbad" })).status, 401);
  r = await call("notion", "call", { method: "POST", path: "/search", body: { query: "x" } }, `fizz_cx_notion=${nc}`);
  j = await r.json();
  assert.equal(j.status, 200);
  assert.ok(!JSON.stringify(j).includes("secret_goodgoodgood"), "token never comes back");
  assert.equal((await call("notion", "call", { path: "https://evil.example/x" }, `fizz_cx_notion=${nc}`)).status, 400);
  assert.equal((await call("notion", "call", { path: "/../../x" }, `fizz_cx_notion=${nc}`)).status, 400);
  assert.equal((await call("notion", "call", { path: "/search" })).status, 401, "not connected");
  assert.equal((await call("notion", "call", { path: "/search" }, `fizz_cx_notion=${nc}`, "https://evil.example")).status, 403);
  assert.equal((await call("nope", "call", {})).status, 404);
  r = await call("telegram", "token", { token: "TG:tok_abcdefgh" });
  const tc = /fizz_cx_telegram=([^;]+)/.exec(r.headers.get("set-cookie"))[1];
  r = await call("telegram", "call", { method: "POST", path: "/sendMessage", body: { chat_id: 1, text: "hi" } }, `fizz_cx_telegram=${tc}`);
  const txt = await r.text();
  assert.ok(!txt.includes("tok_abcdefgh") && txt.includes("••••"), "telegram token in echoed URLs is redacted");
  r = await status(new Request(`${O}/api/status`, { headers: { cookie: `fizz_cx_notion=${nc}` } }));
  j = await r.json();
  assert.equal(j.apps.find((a) => a.id === "notion").connected, true);
  assert.equal(j.apps.find((a) => a.id === "slack").connected, false);
  assert.ok(!JSON.stringify(j).includes("secret_goodgoodgood"));
  globalThis.fetch = realFetch;
}
// MCP servers: the handshake, the sealed cookie, tool calls, redaction, SSRF and both transports
{
  const mcpFn = (await import("../../netlify/functions/mcp.mjs")).default;
  const vMcp = await import("../../api/mcp/[action].mjs");
  delete process.env.CLERK_SECRET_KEY; // no RanEddie ID → requireUser is the single-user "local"
  const realFetch = globalThis.fetch;
  const AUTH = "Bearer secret-mcp-token-abc123";
  const seen = [];
  let sseCtl = null;
  const enc = (m) => new TextEncoder().encode(`data: ${JSON.stringify(m)}\n\n`);
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    seen.push(`${init.method || "GET"} ${u}`);
    const body = init.body ? JSON.parse(init.body) : null;
    const jsonRes = (msg, extra = {}) => new Response(JSON.stringify(msg), { headers: { "content-type": "application/json", ...extra } });
    if (u === "https://203.0.113.10/mcp") {
      // Streamable HTTP: every message is a POST; the session id ties them together.
      if (body?.method === "initialize") return jsonRes({ jsonrpc: "2.0", id: body.id, result: { protocolVersion: "2025-06-18", serverInfo: { name: "Test MCP", version: "1" }, capabilities: { tools: {} } } }, { "mcp-session-id": "sess-1" });
      if (body?.method === "notifications/initialized") return new Response(null, { status: 202 });
      if (body?.method === "tools/list") {
        assert.equal(init.headers["Mcp-Session-Id"], "sess-1", "session id is sent back");
        assert.equal(init.headers.Authorization, AUTH, "the user's header is added by FIZZ's server");
        return jsonRes({ jsonrpc: "2.0", id: body.id, result: { tools: [{ name: "lookup", description: "Looks things up", inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } }] } });
      }
      if (body?.method === "tools/call") {
        // Answered as an SSE stream, like many real servers.
        const msg = JSON.stringify({ jsonrpc: "2.0", id: body.id, result: { content: [{ type: "text", text: `found ${body.params.arguments.query} (token ${AUTH})` }] } });
        return new Response(`data: ${msg}\n\n`, { headers: { "content-type": "text/event-stream" } });
      }
      if (init.method === "DELETE") return new Response(null, { status: 200 });
    }
    if (u === "https://203.0.113.99/sse") {
      // Older transport: GET opens the stream and posts the endpoint; POSTs to it get 202.
      if (init.method === "GET") {
        const stream = new ReadableStream({ start(c) { sseCtl = c; c.enqueue(new TextEncoder().encode("event: endpoint\ndata: /messages\n\n")); } });
        return new Response(stream, { headers: { "content-type": "text/event-stream" } });
      }
      return new Response("{}", { status: 404 });
    }
    if (u === "https://203.0.113.99/messages" && body) {
      if (body.method === "initialize") { setTimeout(() => sseCtl.enqueue(enc({ jsonrpc: "2.0", id: body.id, result: { protocolVersion: "2024-11-05", serverInfo: { name: "Legacy MCP" } } })), 0); return new Response(null, { status: 202 }); }
      if (body.method === "tools/list") { setTimeout(() => sseCtl.enqueue(enc({ jsonrpc: "2.0", id: body.id, result: { tools: [{ name: "old_tool", description: "From the older transport" }] } })), 0); return new Response(null, { status: 202 }); }
      return new Response(null, { status: 202 });
    }
    return realFetch(url, init);
  };
  const post = (action, body, cookie, origin = O) => mcpFn(new Request(`${O}/api/mcp/${action}`, { method: "POST", headers: { origin, ...(body ? { "content-type": "application/json" } : {}), ...(cookie ? { cookie } : {}) }, body: body && JSON.stringify(body) }), { params: { action } });
  const mcpCookieOf = (res) => {
    const m = /fizz_mcp=([^;]+)/.exec(res.headers.get("set-cookie") || "");
    return m ? `fizz_mcp=${m[1]}` : null;
  };

  j = await (await status(new Request(`${O}/api/status`))).json();
  assert.equal(j.mcp.configured, true, "status reports MCP as available");

  // connect: handshake + tools list, saved sealed; the header value never reaches the browser
  r = await post("add", { url: "https://203.0.113.10/mcp", name: "My tracker", headers: { Authorization: AUTH } });
  assert.equal(r.status, 200);
  j = await r.json();
  assert.equal(j.server.name, "My tracker", "the user's name wins");
  assert.equal(j.server.toolCount, 1);
  assert.equal(j.server.tools[0].name, "lookup");
  assert.ok(j.server.tools[0].input.includes("query"), "input schema summarized for the model");
  assert.ok(!JSON.stringify(j).includes("secret-mcp-token-abc123"), "the header value never comes back");
  const setCookie = r.headers.get("set-cookie");
  assert.ok(setCookie?.startsWith("fizz_mcp="), "kept in a sealed HttpOnly cookie");
  assert.ok(/HttpOnly/.test(setCookie) && /Secure/.test(setCookie));
  const sealed = /fizz_mcp=([^;]+)/.exec(setCookie)[1];
  assert.ok(!sealed.includes("secret-mcp-token-abc123") && unseal(decodeURIComponent(sealed)).list[0].headers.Authorization === AUTH, "sealed — the page can't read the header");
  let ck = `fizz_mcp=${sealed}`;

  // list: public info only
  r = await post("list", null, ck);
  assert.equal(r.status, 200);
  j = await r.json();
  assert.equal(j.servers.length, 1);
  assert.equal(j.servers[0].id, "my-tracker", "id is a slug of the chosen name");
  assert.ok(!("headers" in j.servers[0]), "headers are never returned");
  const id = j.servers[0].id;

  // call: tools/call through the session, result text redacted
  r = await post("call", { id, tool: "lookup", arguments: { query: "react" } }, ck);
  assert.equal(r.status, 200);
  j = await r.json();
  assert.equal(j.ok, true);
  assert.match(j.text, /found react/);
  assert.ok(!j.text.includes("secret-mcp-token-abc123"), "header value redacted from tool results");
  assert.ok(j.text.includes("••••"), "redaction marker present");
  assert.ok(seen.some((s) => s === "DELETE https://203.0.113.10/mcp"), "the session is closed after the call");

  // errors: unknown server/tool, malformed arguments
  assert.equal((await post("call", { id: "nope", tool: "x" }, ck)).status, 404);
  assert.equal((await post("call", { id, tool: "" }, ck)).status, 400);
  assert.equal((await post("call", { id, tool: "lookup", arguments: "nope" }, ck)).status, 400);
  assert.equal((await post("tools", { id: "nope" }, ck)).status, 404);
  assert.equal((await post("remove", { id: "nope" }, ck)).status, 404);

  // SSRF and header hygiene, all rejected before anything is saved or sent
  assert.equal((await post("add", { url: "nonsense" }, ck)).status, 400);
  assert.equal((await post("add", { url: "http://localhost/mcp" }, ck)).status, 400, "localhost blocked");
  assert.equal((await post("add", { url: "http://192.168.1.5/mcp" }, ck)).status, 400, "private network blocked");
  assert.equal((await post("add", { url: "http://169.254.169.254/mcp" }, ck)).status, 400, "cloud metadata blocked");
  assert.equal((await post("add", { url: "https://203.0.113.10:8080/mcp" }, ck)).status, 400, "non-standard port blocked");
  assert.equal((await post("add", { url: "ftp://203.0.113.10/mcp" }, ck)).status, 400, "only http(s)");
  assert.equal((await post("add", { url: "https://203.0.113.10/mcp", headers: { "Content-Type": "x" } }, ck)).status, 400, "reserved header blocked");
  assert.equal((await post("add", { url: "https://203.0.113.10/mcp", headers: { "X-Test": "a\nb" } }, ck)).status, 400, "line break in a header blocked");
  assert.equal((await post("add", { url: "https://203.0.113.10/mcp", headers: { "Bad Header": "x" } }, ck)).status, 400, "invalid header name blocked");

  // the older HTTP+SSE transport: POST initialize → 404, then GET stream + endpoint event
  r = await post("add", { url: "https://203.0.113.99/sse" }, ck);
  assert.equal(r.status, 200, "legacy SSE transport connects");
  ck = mcpCookieOf(r);
  j = await r.json();
  assert.equal(j.server.name, "Legacy MCP", "name read from the handshake on the stream");
  assert.equal(j.server.toolCount, 1);
  assert.ok(seen.includes("GET https://203.0.113.99/sse"), "opened the stream");

  // adding the same URL again updates the entry instead of duplicating it
  r = await post("add", { url: "https://203.0.113.10/mcp", headers: { Authorization: AUTH } }, ck);
  assert.equal(r.status, 200);
  ck = mcpCookieOf(r);
  r = await post("list", null, ck);
  j = await r.json();
  assert.equal(j.servers.length, 2, "still two servers after re-adding one");

  // refresh the tool list
  r = await post("tools", { id }, ck);
  assert.equal(r.status, 200);
  assert.equal((await r.json()).server.toolCount, 1);

  // remove
  r = await post("remove", { id }, ck);
  assert.equal(r.status, 200);
  r = await post("list", null, mcpCookieOf(r) || ck);
  j = await r.json();
  assert.equal(j.servers.length, 1);
  assert.equal(j.servers[0].name, "Legacy MCP");

  // guards: cross-site, unknown action, and the Vercel shim routing
  assert.equal((await post("list", null, ck, "https://evil.example")).status, 403, "cross-site blocked");
  assert.equal((await post("nope", {}, ck)).status, 404, "unknown action");
  r = await vMcp.POST(new Request(`${O}/api/mcp/list`, { headers: { origin: O } }));
  assert.equal(r.status, 200, "Vercel shim routes /api/mcp/list");
  assert.ok(Array.isArray((await r.json()).servers));
  globalThis.fetch = realFetch;
}
console.log("All Netlify and Vercel function tests passed");
