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

console.log("All Netlify function tests passed");
