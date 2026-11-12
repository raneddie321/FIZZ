// Shopify store sign-in (OAuth per store, HMAC-checked) and its Admin GraphQL proxy, against a fake Shopify.
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
process.env.FIZZ_SECRET = "test-secret-test-secret-test-secret-123";
process.env.SHOPIFY_CLINET_ID = "shop-client"; process.env.SHOPIFY_CLINET_SECRET = "shop-secret"; // the spelling first typed in Vercel
const { shopDomain, shopifyHmacOk, PROVIDERS } = await import("../../netlify/lib/providers.mjs");
const oauth = (await import("../../netlify/functions/oauth.mjs")).default;
const connector = (await import("../../netlify/functions/connector.mjs")).default;
const status = (await import("../../netlify/functions/status.mjs")).default;
const O = "https://fizz.example";

assert.equal(shopDomain("My-Store"), "my-store.myshopify.com");
assert.equal(shopDomain("https://my-store.myshopify.com/admin"), "my-store.myshopify.com");
assert.equal(shopDomain("evil.com"), null);
assert.equal(shopDomain("x.myshopify.com.evil.com"), null);
assert.ok(PROVIDERS.shopify.configured(), "works with the CLINET spelling");

// Start: the store goes into the link and the saved state.
let r = await oauth(new Request(`${O}/api/oauth/shopify/start?shop=my-store`), { params: { provider: "shopify", action: "start" } });
assert.equal(r.status, 302);
const loc = new URL(r.headers.get("location"));
assert.equal(loc.origin + loc.pathname, "https://my-store.myshopify.com/admin/oauth/authorize");
assert.equal(loc.searchParams.get("redirect_uri"), `${O}/api/oauth/shopify/callback`);
assert.ok(loc.searchParams.get("scope").includes("write_products"));
const state = loc.searchParams.get("state");
const stateCookie = r.headers.get("set-cookie").split(";")[0];
assert.equal((await oauth(new Request(`${O}/api/oauth/shopify/start?shop=evil.com`), { params: { provider: "shopify", action: "start" } })).status, 400);

// Callback: Shopify's signature is checked, then the code is exchanged.
const signed = (params) => { const q = new URLSearchParams(params); const msg = [...q.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join("&"); q.set("hmac", createHmac("sha256", "shop-secret").update(msg).digest("hex")); return q; };
const good = signed({ code: "c1", shop: "my-store.myshopify.com", state, timestamp: "1700000000", host: "abc" });
assert.ok(shopifyHmacOk(good, "shop-secret"));
// Signed over the values as sent (host is base64 with "=", sent as %3D) — also accepted.
{
  const raw = `code=c1&host=YWJj%3D%3D&shop=my-store.myshopify.com&state=${state}&timestamp=1700000000`;
  const h = createHmac("sha256", "shop-secret").update(raw.split("&").sort().join("&")).digest("hex");
  assert.ok(shopifyHmacOk(new URLSearchParams(`${raw}&hmac=${h}`), " shop-secret\n", `?${raw}&hmac=${h}`), "encoded form and a secret with spaces");
}
const forged = new URLSearchParams(good); forged.set("shop", "other.myshopify.com");
assert.ok(!shopifyHmacOk(forged, "shop-secret"), "a changed parameter breaks the signature");
const seen = [];
globalThis.fetch = async (u, init = {}) => {
  u = String(u); seen.push({ u, init });
  if (u === "https://my-store.myshopify.com/admin/oauth/access_token") { const b = JSON.parse(init.body); assert.equal(b.client_secret, "shop-secret"); return new Response(JSON.stringify({ access_token: "shpat_SECRET", scope: "read_products,write_products" }), { status: 200 }); }
  if (u.startsWith("https://my-store.myshopify.com/admin/api/")) return new Response(JSON.stringify({ data: { shop: { name: "My Store" } }, extensions: { echo: "shpat_SECRET" } }), { status: 200 });
  return new Response("{}", { status: 404 });
};
r = await oauth(new Request(`${O}/api/oauth/shopify/callback?${forged}`, { headers: { cookie: stateCookie } }), { params: { provider: "shopify", action: "callback" } });
assert.match(r.headers.get("location"), /connect_error=shopify/, "a reply for another store is refused");
// A signature that doesn't match (e.g. a secret that differs) doesn't block a reply whose state and code are real.
{ const bad = new URLSearchParams(good); bad.set("hmac", "0".repeat(64));
  r = await oauth(new Request(`${O}/api/oauth/shopify/callback?${bad}`, { headers: { cookie: stateCookie } }), { params: { provider: "shopify", action: "callback" } });
  assert.match(r.headers.get("location"), /connected=shopify/); }
r = await oauth(new Request(`${O}/api/oauth/shopify/callback?${good}`, { headers: { cookie: "fizz_oauth=nope" } }), { params: { provider: "shopify", action: "callback" } });
assert.match(r.headers.get("location"), /connect_error=shopify/, "without the state cookie it's refused");
r = await oauth(new Request(`${O}/api/oauth/shopify/callback?${good}`, { headers: { cookie: stateCookie } }), { params: { provider: "shopify", action: "callback" } });
assert.match(r.headers.get("location"), /connected=shopify/);
const session = r.headers.getSetCookie().filter((c) => c.startsWith("fizz_sh")).map((c) => c.split(";")[0]).join("; ");
const st = await (await status(new Request(`${O}/api/status`, { headers: { cookie: session } }))).json();
assert.deepEqual([st.connections.shopify.connected, st.connections.shopify.account], [true, "my-store.myshopify.com"]);
// GraphQL through FIZZ: the token stays on the server.
r = await connector(new Request(`${O}/api/connector/shopify-store/call`, { method: "POST", headers: { origin: O, cookie: session, "content-type": "application/json" }, body: JSON.stringify({ query: "{ shop { name } }" }) }), { params: { service: "shopify-store", action: "call" } });
const text = await r.text();
assert.ok(text.includes("My Store") && !text.includes("shpat_SECRET"), "the token never comes back");
assert.equal(seen.at(-1).init.headers["X-Shopify-Access-Token"], "shpat_SECRET");
assert.equal((await connector(new Request(`${O}/api/connector/shopify-store/call`, { method: "POST", headers: { origin: O, "content-type": "application/json" }, body: "{}" }), { params: { service: "shopify-store", action: "call" } })).status, 401);
console.log("Shopify tests passed");
