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
  "/show": `<form><input id=e type=email name=email><input id=p type=password><button type=button onclick="p.type='text'">show</button></form>`,
};
const srv = createServer((q, r) => { r.writeHead(200, { "content-type": "text/html" }); r.end(`<!doctype html><title>t</title>${pages[q.url] || "<p>nothing</p>"}`); }).listen(0);
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

await browser.close(); srv.close();
console.log("Login fill tests passed");
