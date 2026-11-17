// Saved website logins: the password is sealed for one user and one site; the AI never gets it back.
import assert from "node:assert/strict";
process.env.FIZZ_SECRET = "test-secret-for-logins-0123456789abcdef0123";
process.env.FIZZ_SANDBOX = "on";
process.env.FIZZ_SANDBOX_LOCAL = "1";
const { loginHost, sameSite } = await import("../../netlify/lib/browser.mjs");
const { unseal } = await import("../../netlify/lib/util.mjs");
const browser = (await import("../../netlify/functions/browser.mjs")).default;

assert.equal(loginHost("https://www.Example.com/login?x=1"), "example.com");
assert.equal(loginHost("app.example.co.il"), "app.example.co.il");
assert.ok(sameSite("example.com", "example.com"));
assert.ok(sameSite("login.example.com", "example.com"));
assert.ok(sameSite("accounts.example.com", "app.example.com"), "same registrable name");
assert.ok(!sameSite("example.com.evil.io", "example.com"), "a look-alike domain gets nothing");
assert.ok(!sameSite("evil-example.com", "example.com"));
assert.ok(!sameSite("", "example.com"));

const O = "https://fizz.test";
const call = (body, device = "a".repeat(32)) => browser(new Request(`${O}/api/browser`, { method: "POST", headers: { origin: O, "content-type": "application/json", "x-fizz-device": device }, body: JSON.stringify(body) }));

// Sealing: the reply holds the site and a sealed blob, never the password.
let r = await call({ action: "seal-login", url: "https://www.example.com/login", password: "hunter2-secret" });
assert.equal(r.status, 200);
const j = await r.json();
assert.equal(j.host, "example.com");
assert.ok(!JSON.stringify(j).includes("hunter2-secret"), "the password doesn't come back");
const sealed = unseal(j.secret);
assert.deepEqual([sealed.kind, sealed.host, sealed.p], ["login", "example.com", "hunter2-secret"]);
assert.equal((await call({ action: "seal-login", url: "not a url", password: "x" })).status, 400);
assert.equal((await call({ action: "seal-login", url: "example.com", password: "" })).status, 400);

// Another user (device) can't use someone else's sealed login.
r = await call({ action: "autofill", secret: j.secret }, "b".repeat(32));
assert.equal(r.status, 400);
assert.equal((await r.json()).error.code, "bad_login");
// Cards: validated, sealed for this user; only brand, last 4 and expiry come back in the clear.
r = await call({ action: "seal-card", number: "4242 4242 4242 4242", month: "7", year: "28", cvc: "123", name: "Dana" });
assert.equal(r.status, 200);
const cj = await r.json();
assert.deepEqual([cj.brand, cj.last4, cj.exp], ["Visa", "4242", "07/28"]);
assert.ok(!JSON.stringify({ ...cj, secret: "" }).includes("4242424242424242") && !cj.secret.includes("4242"), "the number stays sealed");
const sc = unseal(cj.secret);
assert.deepEqual([sc.kind, sc.number, sc.month, sc.year, sc.cvc], ["card", "4242424242424242", "07", "2028", "123"]);
assert.equal((await call({ action: "seal-card", number: "4242 4242 4242 4241", month: "07", year: "2028" })).status, 400, "a wrong number (Luhn) is refused");
assert.equal((await call({ action: "seal-card", number: "4242424242424242", month: "13", year: "2028" })).status, 400);
r = await call({ action: "autofill-card", secret: cj.secret }, "b".repeat(32));
assert.equal((await r.json()).error.code, "bad_card", "another user can't use the card");
console.log("Logins tests passed");
