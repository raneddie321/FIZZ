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
console.log("All Netlify and Vercel function tests passed");
