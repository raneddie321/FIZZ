// The saved-login fill in the cloud browser (netlify/lib/browser.mjs act "autofill"), against a real Chromium over CDP.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { chromium } from "playwright-core";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
const { act } = await import("../../netlify/lib/browser.mjs");

const base = "/opt/pw-browsers";
const exe = readdirSync(base).sort().reverse().map((d) => join(base, d, "chrome-linux64/chrome")).find(existsSync);
const pages = {
  "/login": `<form><label>Email <input id=e type=email name=email></label><label>Password <input id=p type=password name=password></label><button>Sign in</button></form>`,
  "/two-step": `<form><label>Username <input id=u type=text name=username autocomplete=username></label><button>Next</button></form>`,
  "/list": `<meta http-equiv="Content-Security-Policy" content="script-src 'none'"><h2><a href="/a">Alpha</a></h2><h2><a href="/b">Beta</a></h2>`,
  "/checkout": `<form><input id=num autocomplete=cc-number placeholder="1234 1234 1234 1234"><input id=exp autocomplete=cc-exp placeholder="MM / YY"><input id=cvc autocomplete=cc-csc><input id=nm autocomplete=cc-name><button type=button>Pay</button></form>`,
  "/selects": `<form><input id=num name=cardnumber><select id=m name=exp-month><option>--</option><option value="01">01</option><option value="12">12</option></select><select id=y name=exp-year><option>--</option><option value="2028">2028</option><option value="2029">2029</option></select><input id=cvc name=cvv></form>`,
  "/cardframe": `<input id=num autocomplete=cc-number><input id=exp autocomplete=cc-exp placeholder="MM / YY"><input id=cvc autocomplete=cc-csc>`,
  "/iframe-same": `<h1>Pay</h1><iframe id=f src="/cardframe" width=400 height=120></iframe>`,
  "/iframe-cross": `<h1>Pay</h1><iframe id=f src="http://localhost:PORT/cardframe" width=400 height=120></iframe>`,
  "/show": `<form><input id=e type=email name=email><input id=p type=password><button type=button onclick="p.type='text'">show</button></form>`,
};
const srv = createServer((q, r) => { r.writeHead(200, { "content-type": "text/html" }); r.end(`<!doctype html><title>t</title>${(pages[q.url] || "<p>nothing</p>").replace("PORT", srv.address().port)}`); }).listen(0);
const port = srv.address().port;
const browser = await chromium.launch({ executablePath: exe, args: ["--remote-debugging-port=9339"] });
const ws = (await (await fetch("http://127.0.0.1:9339/json/version")).json()).webSocketDebuggerUrl;
const page = await browser.newPage();
const fill = { host: "127.0.0.1", pass: "Sup3r-Secret!", email: "me@example.com", username: "me123" };

await page.goto(`http://127.0.0.1:${port}/login`);
let out = await act({ connectUrl: ws, active: null }, { action: "autofill", fill });
assert.equal(await page.inputValue("#e"), "me@example.com", "the email field gets the email");
assert.equal(await page.inputValue("#p"), "Sup3r-Secret!", "the password is typed into the page");
assert.ok(!out.text.includes("Sup3r-Secret!"), "the AI never reads the password back");
assert.match(out.text, /Filled the saved login for 127\.0\.0\.1: the email and the password/);

await page.goto(`http://127.0.0.1:${port}/two-step`);
out = await act({ connectUrl: ws, active: null }, { action: "autofill", fill });
assert.equal(await page.inputValue("#u"), "me123", "a username field gets the username");
assert.match(out.text, /only asks for the email or username/);

// A field that shows the password as text: still hidden from what the AI reads.
await page.goto(`http://127.0.0.1:${port}/show`);
await act({ connectUrl: ws, active: null }, { action: "autofill", fill });
await page.click("button");
out = await act({ connectUrl: ws, active: null }, { action: "read" });
assert.ok(!out.text.includes("Sup3r-Secret!"));

// Another site: nothing is filled.
await page.goto(`http://localhost:${port}/login`);
await assert.rejects(act({ connectUrl: ws, active: null }, { action: "autofill", fill }), (e) => e.code === "wrong_site");
assert.equal(await page.inputValue("#p"), "");
// No login form: says so.
await page.goto(`http://127.0.0.1:${port}/nothing`);
await assert.rejects(act({ connectUrl: ws, active: null }, { action: "autofill", fill }), (e) => e.code === "no_login_form");

// Code in the page: data comes back as text, even under a strict CSP; never on a page with a password field.
await page.goto(`http://127.0.0.1:${port}/list`);
out = await act({ connectUrl: ws, active: null }, { action: "script", code: "return [...document.querySelectorAll('h2 a')].map(a => a.innerText)" });
assert.match(out.text, /Result of your code:\n\[\n "Alpha",\n "Beta"\n\]/);
out = await act({ connectUrl: ws, active: null }, { action: "script", code: "document.title" });
assert.match(out.text, /Result of your code:\nt\n/);
await assert.rejects(act({ connectUrl: ws, active: null }, { action: "script", code: "nope(" }), /The code threw/);
await page.goto(`http://127.0.0.1:${port}/login`);
await assert.rejects(act({ connectUrl: ws, active: null }, { action: "script", code: "return document.querySelector('#p').value" }), (e) => e.code === "script_blocked");

// Saved cards: filled only after approval for this site, in the page or inside an iframe (same site or another site).
const card = { number: "4242424242424242", month: "12", year: "2028", cvc: "123", name: "Dana Levi", zip: "" };
await page.goto(`http://127.0.0.1:${port}/checkout`);
await assert.rejects(act({ connectUrl: ws, active: null }, { action: "autofill-card", card, approvedHost: "shop.example" }), (e) => e.code === "wrong_site");
assert.equal(await page.inputValue("#num"), "", "nothing filled on a site that wasn't approved");
out = await act({ connectUrl: ws, active: null }, { action: "autofill-card", card, approvedHost: "127.0.0.1" });
assert.deepEqual([await page.inputValue("#num"), await page.inputValue("#exp"), await page.inputValue("#cvc"), await page.inputValue("#nm")], ["4242424242424242", "12/28", "123", "Dana Levi"]);
assert.ok(!/4242424242424242|"123"/.test(out.text), "the AI never reads the card back");
out = await act({ connectUrl: ws, active: null }, { action: "read" });
assert.ok(!out.text.includes("4242424242424242"), "and not on a later read either");
await assert.rejects(act({ connectUrl: ws, active: null }, { action: "script", code: "return document.querySelector('#num').value" }), (e) => e.code === "script_blocked");
await page.goto(`http://127.0.0.1:${port}/selects`);
await act({ connectUrl: ws, active: null }, { action: "autofill-card", card, approvedHost: "127.0.0.1" });
assert.deepEqual([await page.inputValue("#num"), await page.inputValue("#m"), await page.inputValue("#y"), await page.inputValue("#cvc")], ["4242424242424242", "12", "2028", "123"], "month and year menus");
for (const kind of ["same", "cross"]) {
  await page.goto(`http://127.0.0.1:${port}/iframe-${kind}`);
  await page.waitForTimeout(400);
  out = await act({ connectUrl: ws, active: null }, { action: "autofill-card", card, approvedHost: "127.0.0.1" });
  const fr = page.frames().find((f) => f.url().includes("/cardframe"));
  assert.deepEqual([await fr.inputValue("#num"), await fr.inputValue("#exp"), await fr.inputValue("#cvc")], ["4242424242424242", "12/28", "123"], `card inside a ${kind}-site iframe`);
}
await page.goto(`http://127.0.0.1:${port}/login`);
await assert.rejects(act({ connectUrl: ws, active: null }, { action: "autofill-card", card, approvedHost: "127.0.0.1" }), (e) => e.code === "no_card_form");

await browser.close(); srv.close();
console.log("Login fill tests passed");
