// Run: CDP_URL=ws://localhost:9340/devtools/browser/… SITE=http://localhost:8095 node tests/netlify/browser.test.mjs
// Drives a real (local) Chrome over CDP the same way FIZZ drives the Browserbase cloud browser.
import assert from "node:assert/strict";
const { act } = await import("../../netlify/lib/browser.mjs");
const SITE = process.env.SITE || "http://localhost:8095";
if (!process.env.CDP_URL) { console.log("Skipped (set CDP_URL to a Chrome DevTools browser WebSocket)"); process.exit(0); }
const state = { connectUrl: process.env.CDP_URL, active: null };
const find = (r, label) => r.page.elements.find((e) => e.label.toLowerCase().includes(label.toLowerCase()));

let r = await act(state, { action: "open", url: `${SITE}/index.html` });
assert.equal(r.page.title, "Test Shop");
assert.match(r.text, /\[\d+\] link "Log in" → http/);
assert.match(r.text, /Welcome to Test Shop/);

// select and type + enter (submits the search form)
r = await act(state, { action: "select", id: find(r, "Country").id, value: "United States" });
assert.match(r.text, /value: "us"/);
r = await act(state, { action: "type", id: find(r, "Search products").id, text: "red shoes", enter: true });
assert.equal(r.page.title, "Results");
assert.match(r.page.url, /q=red\+shoes/);

r = await act(state, { action: "back" });
assert.equal(r.page.title, "Test Shop");

// scrolling shows more of the page
const y0 = Number(/Scrolled (\d+)px/.exec(r.text)[1]);
r = await act(state, { action: "scroll", direction: "down", amount: 1200 });
assert.ok(Number(/Scrolled (\d+)px/.exec(r.text)[1]) > y0, "scrolled down");

// a link with target=_blank opens a new tab and switches to it
r = await act(state, { action: "scroll", direction: "up", amount: 5000 });
r = await act(state, { action: "click", id: find(r, "Open help").id });
assert.equal(r.page.title, "Help");
assert.match(r.text, /opened a new tab/);
assert.equal(r.tabs.filter((t) => t.url.startsWith(SITE)).length >= 2, true);
const helpTab = state.active;
const shopTab = r.tabs.find((t) => t.title === "Test Shop").id;
r = await act(state, { action: "switch", tab: shopTab });
assert.equal(r.page.title, "Test Shop");
r = await act(state, { action: "close", tab: helpTab });
assert.ok(!r.tabs.some((t) => t.id === helpTab));

// login form: email is typed, the password field is refused, the button is really clicked
r = await act(state, { action: "click", id: find(r, "Log in").id });
assert.equal(r.page.title, "Login");
r = await act(state, { action: "type", id: find(r, "Email").id, text: "eddie@example.com" });
await assert.rejects(act(state, { action: "type", id: find(r, "Password").id, text: "hunter2" }), (e) => e.code === "secret_field");
r = await act(state, { action: "read" });
r = await act(state, { action: "click", id: find(r, "Sign in").id });
assert.equal(r.page.title, "Clicked eddie@example.com");

r = await act(state, { action: "screenshot" });
assert.match(r.screenshot, /^data:image\/jpeg;base64,/);
await assert.rejects(act(state, { action: "click", id: "999" }), /no element \[999\]/);

// ---------- /api/browser with a fake Browserbase API (and the same real Chrome) ----------
process.env.FIZZ_SECRET = "test-secret-test-secret-test-secret-123";
process.env.BROWSERBASE_API_KEY = "bb_fake";
const { route } = await import("../../netlify/lib/vercel-adapter.mjs");
const vBrowser = route((await import("../../netlify/functions/browser.mjs")).default, []);
const realFetch = globalThis.fetch;
const bbCalls = [];
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  if (!url.startsWith("https://api.browserbase.com/")) return realFetch(url, init);
  assert.equal(init.headers["X-BB-API-Key"], "bb_fake");
  const path = url.replace("https://api.browserbase.com/v1", "");
  bbCalls.push(`${init.method || "GET"} ${path}`);
  if (path === "/contexts") return Response.json({ id: "ctx_1" });
  if (path === "/sessions") { const b = JSON.parse(init.body); assert.deepEqual(b.browserSettings.context, { id: "ctx_1", persist: true }, "logins are kept"); return Response.json({ id: "sess_1", connectUrl: process.env.CDP_URL }); }
  if (path === "/sessions/sess_1") return init.method === "POST" ? Response.json({ id: "sess_1" }) : Response.json({ status: "RUNNING" });
  if (path === "/sessions/sess_1/debug") return Response.json({ debuggerFullscreenUrl: "https://live.example/main", pages: [{ id: state.active, url: "x", title: "x", debuggerFullscreenUrl: "https://live.example/tab" }] });
  throw new Error("unexpected " + path);
};
const O = "https://fizz.example";
let cookie = "";
const call = async (body) => {
  const res = await vBrowser.POST(new Request(`${O}/api/browser`, { method: "POST", headers: { origin: O, "content-type": "application/json", cookie }, body: JSON.stringify(body) }));
  const set = res.headers.get("set-cookie");
  if (set) cookie = set.split(";")[0];
  return res;
};
let res = await call({ action: "open", url: `${SITE}/login.html` });
let j = await res.json();
assert.equal(res.status, 200, JSON.stringify(j));
assert.equal(j.page.title, "Login");
assert.ok(j.tabs.some((t) => t.live === "https://live.example/tab"), "each tab has its live view link");
assert.match(cookie, /^fizz_br=/);
assert.ok(!cookie.includes("ctx_1") && !cookie.includes("ws://"), "the session cookie is encrypted");
res = await call({ action: "read" });
assert.equal(res.status, 200);
assert.equal(bbCalls.filter((c) => c === "POST /sessions").length, 1, "the session is reused");
j = await (await call({ action: "type", id: j.elements.find((e) => e.type === "password").id, text: "x" })).json();
assert.equal(j.error.code, "secret_field");
j = await (await call({ action: "live" })).json();
assert.equal(j.main, "https://live.example/main");
await call({ action: "release" });
assert.ok(bbCalls.includes("POST /sessions/sess_1"), "released");
res = await vBrowser.POST(new Request(`${O}/api/browser`, { method: "POST", headers: { origin: "https://evil.example", cookie }, body: "{}" }));
assert.equal(res.status, 403);
globalThis.fetch = realFetch;

// ---------- FIZZ's own cloud browser (Vercel Sandbox) with a fake sandbox pointing at a local agent ----------
if (process.env.AGENT_URL) {
  delete process.env.BROWSERBASE_API_KEY;
  process.env.FIZZ_SANDBOX = "on";
  process.env.FIZZ_SANDBOX_LOCAL = "1";
  const { setSandboxModule } = await import("../../netlify/lib/sandbox.mjs");
  const { tokenFor } = await import("../../netlify/lib/sandbox-browser.mjs");
  const ran = [];
  setSandboxModule({ Sandbox: { getOrCreate: async (o) => ({ name: o.name, domain: () => process.env.AGENT_URL, writeFiles: async () => {}, runCommand: async (c) => { ran.push(c.args?.[1] || c.cmd); } }) } });
  process.env.AGENT_TOKEN_EXPECT = tokenFor("local");
  if (process.env.AGENT_TOKEN && process.env.AGENT_TOKEN !== tokenFor("local")) throw new Error(`start the agent with FIZZ_BR_TOKEN=${tokenFor("local")}`);
  cookie = "";
  res = await call({ action: "open", url: `${SITE}/index.html` });
  j = await res.json();
  assert.equal(res.status, 200, JSON.stringify(j));
  assert.equal(j.engine, "sandbox");
  assert.equal(j.page.title, "Test Shop");
  const tab = j.tabs.find((t) => t.active);
  assert.match(tab.stream, /\/stream\?token=[0-9a-f]{40}&target=/, "live stream link");
  assert.match(tab.input, /\/input\?token=/, "input link");
  assert.equal(ran.length, 0, "a running agent isn't restarted");
  j = await (await call({ action: "live" })).json();
  assert.ok(j.pages.length >= 1 && j.pages[0].stream);
  const st2 = await (await call({ action: "type", id: j.pages.length && 2, text: "shoes", enter: false })).json();
  assert.ok(st2.text || st2.error);
  console.log("sandbox engine OK");
}
console.log("All browser tests passed");
