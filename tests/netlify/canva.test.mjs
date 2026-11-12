// Canva: the sign-in link Canva accepts, and /api/connector/canva/call (refresh, allowed paths, downloads) against a fake Canva.
import assert from "node:assert/strict";
process.env.FIZZ_SECRET = "test-secret-test-secret-test-secret-123";
process.env.CANVA_CLIENT_ID = "OC-test"; process.env.CANVA_CLIENT_SECRET = "cs";
const { seal, unseal } = await import("../../netlify/lib/util.mjs");
const { PROVIDERS, CANVA_SCOPES } = await import("../../netlify/lib/providers.mjs");
const connector = (await import("../../netlify/functions/connector.mjs")).default;
const O = "https://fizz.example";

const url = PROVIDERS.canva.authorizeUrl(O, "st", "ch");
assert.ok(url.includes("code_challenge_method=s256"), "lowercase s256");
assert.ok(url.includes(`scope=${encodeURIComponent(CANVA_SCOPES)}`) && url.includes("%20") && !url.includes("+"), "scopes separated by %20");
assert.ok(url.includes(`redirect_uri=${encodeURIComponent(`${O}/api/oauth/canva/callback`)}`));
assert.ok(CANVA_SCOPES.includes("design:content:write") && CANVA_SCOPES.includes("asset:write"));

const seen = [];
globalThis.fetch = async (u, init = {}) => {
  u = String(u); seen.push({ u, init });
  const ok = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { "content-type": "application/json" } });
  if (u.endsWith("/oauth/token")) return ok({ access_token: "fresh", refresh_token: "r2", expires_in: 14400 });
  if (u.includes("/designs?")) return ok({ items: [{ id: "D1", title: "Logo" }] });
  if (u.endsWith("/asset-uploads")) return ok({ job: { id: "J1", status: "in_progress" } });
  if (u.startsWith("https://export-download.canva.com/")) return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "image/png" } });
  return ok({ message: "unexpected" }, 500);
};
const call = (body, cookie) => connector(new Request(`${O}/api/connector/canva/call`, { method: "POST", headers: { origin: O, "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) }), { params: { service: "canva", action: "call" } });
const expired = `fizz_cv=${encodeURIComponent(seal({ t: "old", r: "r1", at: Date.now() - 1000, label: "Canva account" }))}`;

assert.equal((await call({ path: "/designs" })).status, 401, "not connected");
let r = await call({ path: "/designs", query: { query: "logo" } }, expired);
let j = await r.json();
assert.equal(j.data.items[0].id, "D1");
assert.ok(seen.some((x) => x.u.endsWith("/oauth/token")), "an expired token is refreshed");
assert.equal(seen.at(-1).init.headers.Authorization, "Bearer fresh");
const ck = (r.headers.getSetCookie?.() || []).find((c) => c.startsWith("fizz_cv="));
assert.equal(unseal(decodeURIComponent(ck.split(";")[0].slice(8))).r, "r2", "the new single-use refresh token is kept");
assert.equal((await call({ path: "/../oauth/token" }, expired)).status, 400, "only known Canva paths");
assert.equal((await call({ path: "https://evil.example" }, expired)).status, 400);
r = await call({ method: "POST", path: "/asset-uploads", upload: { name: "logo.png", base64: "AQID" } }, expired);
const up = seen.at(-1);
assert.ok(up.init.headers["Asset-Upload-Metadata"].includes("name_base64") && up.init.body.length === 3, "upload sends the bytes and the name header");
j = await (await call({ download: "https://export-download.canva.com/x.png" }, expired)).json();
assert.equal(j.data.base64, "AQID");
assert.equal((await call({ download: "https://evil.example/x.png" }, expired)).status, 400, "only Canva's export links");
assert.equal((await connector(new Request(`${O}/api/connector/canva/call`, { method: "POST", headers: { origin: "https://evil.example" }, body: "{}" }), { params: { service: "canva", action: "call" } })).status, 403);
console.log("Canva tests passed");
