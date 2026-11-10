// End-to-end smoke test of FIZZ and FIZZ DEV in a real browser, with the AI and server APIs mocked.
// Run: node tests/e2e/smoke.mjs   (needs playwright-core and a Chromium; set CHROME=/path/to/chrome if not found)
import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import { extname, join, normalize } from "node:path";

const ROOT = new URL("../../static-site/", import.meta.url).pathname;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json", ".woff2": "font/woff2", ".wasm": "application/wasm" };
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
  try { const body = await readFile(join(ROOT, path === "/" ? "index.html" : path)); res.writeHead(200, { "content-type": TYPES[extname(path)] || "application/octet-stream" }); res.end(body); }
  catch { res.writeHead(404); res.end("not found"); }
}).listen(0);
const B = `http://localhost:${server.address().port}/`;

function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const base = "/opt/pw-browsers";
  for (const d of existsSync(base) ? readdirSync(base).sort().reverse() : []) for (const p of ["chrome-linux64/chrome", "chrome-linux/chrome"]) if (existsSync(join(base, d, p))) return join(base, d, p);
  return undefined;
}
const browser = await chromium.launch({ executablePath: findChrome() });
let failures = 0;
const check = (name, ok, extra = "") => { console.log(`${ok ? "ok  " : "FAIL"} ${name}${extra ? ` — ${extra}` : ""}`); if (!ok) failures++; };
const sse = (t) => t.match(/[\s\S]{1,40}/g).map((c) => `data: ${JSON.stringify({ choices: [{ delta: { content: c } }] })}\n\n`).join("") + "data: [DONE]\n\n";

async function open(viewport) {
  const ctx = await browser.newContext({ viewport });
  const errs = [], bodies = [];
  const script = [];
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, body: "" }));
  await ctx.route("**/api/status", (r) => r.fulfill({ json: { server: true, apps: [{ id: "telegram", name: "Telegram", connected: true, account: "@bot" }], ai: { configured: true, model: "test-model", dailyLimit: 50 }, connections: { github: { configured: true, connected: false } }, google: {}, tools: { search: "wikipedia" } } }));
  await ctx.route("**/api/ai/chat", async (r) => { bodies.push(r.request().postDataJSON()); const next = script.shift() ?? "Done."; await r.fulfill({ status: 200, headers: { "content-type": "text/event-stream" }, body: sse(next) }); });
  await ctx.route("**/api/connector/*/call", (r) => r.fulfill({ json: { status: 200, ok: true, data: { ok: true } } }));
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errs.push(`pageerror: ${e.message}`));
  p.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|net::|favicon/i.test(m.text())) errs.push(`console: ${m.text()}`); });
  await p.goto(B + "index.html");
  await p.evaluate(() => localStorage.setItem("fizz.rid.user", JSON.stringify({ id: "user_t", name: "Eddie", email: "t@example.com" })));
  return { ctx, p, errs, bodies, script };
}
const lastReply = (p, app, text) => p.waitForFunction(([a, t]) => document.querySelector(a)?.innerText.includes(t), [app, text], { timeout: 20000 });

// ---------- public pages ----------
{
  const { ctx, p, errs } = await open({ width: 1280, height: 800 });
  for (const page of ["index.html", "pricing.html", "privacy.html", "terms.html", "fizz.html", "fizz-dev.html", "signin.html"]) {
    await p.goto(B + page); await p.waitForTimeout(300);
    check(`page ${page} renders`, (await p.locator("body").innerText()).trim().length > 50);
  }
  check("public pages have no script errors", !errs.length, errs.join(" | "));
  await ctx.close();
}

// ---------- FIZZ chat ----------
for (const vp of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
  const { ctx, p, errs, script } = await open(vp);
  await p.goto(B + "chat.html"); await p.waitForTimeout(800);
  script.push("Hello **Eddie**, here is the answer.");
  const input = p.locator("#chat-app #input, [data-app=chat] #input").first();
  await input.fill("hi there");
  await p.keyboard.press("Enter");
  await lastReply(p, "#chat-app", "here is the answer").then(() => check(`chat reply shows (${vp.width}px)`, true)).catch(() => check(`chat reply shows (${vp.width}px)`, false));
  const over = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  check(`chat has no horizontal scroll (${vp.width}px)`, over <= 1, `${over}px`);
  check(`chat has no script errors (${vp.width}px)`, !errs.length, errs.join(" | "));
  await ctx.close();
}

// ---------- FIZZ DEV: build turn, preview, self-check ----------
for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  const { ctx, p, errs, bodies, script } = await open(vp);
  await p.goto(B + "dev.html"); await p.waitForTimeout(900);
  const F = (path, body) => `<fizz-file path="${path}">\n${body}\n</fizz-file>\n`;
  script.push("<fizz-plan>\n- [x] Page\n</fizz-plan>\n" + F("index.html", `<!doctype html><html><head><meta name="viewport" content="width=device-width"></head><body><h1 id="t">x</h1><script type="module" src="js/main.js"></script></body></html>`) + F("js/main.js", `import { msg } from "./msg.js";\ndocument.getElementById("t").textContent = msg;`) + F("js/msg.js", `export const msg = "Hello modules";`) + "Built it.");
  await p.fill("#dev-app #input", "build a hello page"); await p.keyboard.press("Enter");
  await lastReply(p, "#dev-app", "Built it").then(() => check(`dev build reply (${vp.width}px)`, true)).catch(() => check(`dev build reply (${vp.width}px)`, false));
  await p.waitForSelector("#dev-app .verify-note.ok", { timeout: 20000 }).then(() => check(`dev self-check passes (${vp.width}px)`, true)).catch(async () => check(`dev self-check passes (${vp.width}px)`, false, await p.locator("#dev-app .verify-note").allInnerTexts().then((x) => x.join(" "))));
  const files = await p.evaluate(() => Object.keys(JSON.parse(localStorage.getItem(Object.keys(localStorage).find((k) => k.startsWith("fizz.data.")))).projects[0].files));
  check(`dev wrote 3 files (${vp.width}px)`, files.length === 3, files.join(","));
  check(`dev handbook in prompt (${vp.width}px)`, bodies[0]?.system?.includes("# HOW YOU WORK"));
  if (vp.width > 800) {
    const txt = await p.frameLocator("#preview").locator("#t").innerText({ timeout: 8000 }).catch(() => "");
    check("preview runs ES modules across files", txt === "Hello modules", txt);
  } else {
    // Phone: the views menu must reach the browser preview and come back to the chat.
    const menu = p.locator("#mobile-view-menu");
    check("phone: views menu button visible", await menu.isVisible().catch(() => false));
    await menu.click();
    await p.locator('.mobile-view-sheet [data-mobile-view="browser"]').click();
    await p.waitForTimeout(400);
    check("phone: menu opens the browser view", await p.locator("#dev-app .pane-browser").isVisible());
    await p.locator("#mobile-back-chat").click();
    await p.waitForTimeout(400);
    check("phone: Chat button returns to the conversation", await p.locator("#dev-app #input").isVisible());
  }
  const over = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  check(`dev has no horizontal scroll (${vp.width}px)`, over <= 1, `${over}px`);
  check(`dev has no script errors (${vp.width}px)`, !errs.length, errs.join(" | "));
  await ctx.close();
}

// ---------- FIZZ DEV: the five checks catch a crashing button, a too-wide phone page and a review finding ----------
{
  const { ctx, p, errs, bodies, script } = await open({ width: 1440, height: 900 });
  await p.goto(B + "dev.html"); await p.waitForTimeout(900);
  const F = (path, body) => `<fizz-file path="${path}">\n${body}\n</fizz-file>\n`;
  script.push(
    F("index.html", `<!doctype html><html><head><meta name="viewport" content="width=device-width"></head><body><div style="width:900px">wide</div><button id="b">Go</button><script>document.getElementById("b").onclick = () => { missingFn(); };</script></body></html>`) + "Built.",
    "- index.html:1 — the Go button calls missingFn, which doesn't exist — define it",
    F("index.html", `<!doctype html><html><head><meta name="viewport" content="width=device-width"></head><body><div style="max-width:100%">ok</div><button id="b">Go</button><script>document.getElementById("b").onclick = () => { document.body.dataset.ok = "1"; };</script></body></html>`) + "Fixed.",
  );
  await p.fill("#dev-app #input", "make a page with a Go button"); await p.keyboard.press("Enter");
  await p.waitForFunction(() => document.querySelector("#dev-app")?.innerText.includes("Fixed."), null, { timeout: 90000 }).catch(() => {});
  const fed = JSON.stringify(bodies.find((b) => JSON.stringify(b.messages?.at(-1)?.content || "").includes("FIZZ DEV checked"))?.messages.at(-1).content || "");
  check("checks: crashing button found", /pressing button#b/.test(fed), fed.slice(0, 200));
  check("checks: too wide on a phone found", /scrolls sideways/.test(fed));
  check("checks: AI review finding sent back", /review: the Go button calls missingFn/.test(fed));
  await p.waitForSelector("#dev-app .verify-note.ok", { timeout: 60000 }).then(() => check("checks: pass after the fix", true)).catch(async () => check("checks: pass after the fix", false, (await p.locator("#dev-app .verify-note").allInnerTexts()).join(" | ")));
  check("checks: shows the 5-check list", (await p.locator("#dev-app .verify-note.ok .check-list li").count()) === 5);
  const real = errs.filter((e) => !/missingFn/.test(e)); // the planted bug, thrown inside the tested page
  check("checks: no script errors in FIZZ DEV", !real.length, real.join(" | "));
  await ctx.close();
}

// ---------- FIZZ DEV: Do mode, approval, memory ----------
{
  const { ctx, p, errs, bodies, script } = await open({ width: 1280, height: 800 });
  await p.goto(B + "dev.html"); await p.waitForTimeout(900);
  // Do mode is pinned from the + menu (there are no mode buttons any more).
  await p.click("#dev-app #attach");
  await p.click('.plus-sheet [data-ps-go="mode"]');
  await p.click('.plus-sheet [data-ps-mode="do"]');
  check("+ menu: mode shows Do", (await p.locator(".plus-sheet").innerText()).includes("Do"));
  await p.click('.plus-sheet [data-ps="close"]');
  script.push(`<fizz-remember>Prefers short answers</fizz-remember>\n<fizz-api service="telegram" method="POST" path="/sendMessage">{"chat_id":1,"text":"hi"}</fizz-api>`, "Sent it.");
  await p.fill("#dev-app #input", "remember I like short answers and message me on telegram"); await p.keyboard.press("Enter");
  await p.waitForSelector("#dev-app .stage-bar [data-approve]", { timeout: 15000 }).then(() => check("do: sending waits for approval", true)).catch(() => check("do: sending waits for approval", false));
  check("do: assistant handbook in prompt", bodies[0]?.system?.includes("WHO YOU ARE IN DO MODE"));
  await p.click("#dev-app .stage-bar [data-approve]").catch(() => {});
  await lastReply(p, "#dev-app", "Sent it").then(() => check("do: continues after approval", true)).catch(() => check("do: continues after approval", false));
  const mem = await p.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find((k) => k.startsWith("fizz.data.")))).settings.memory || []);
  check("do: memory saved", mem.includes("Prefers short answers"), JSON.stringify(mem));
  check("do: no script errors", !errs.length, errs.join(" | "));
  await ctx.close();
}

// ---------- Custom connectors: Claude-style two-step dialog, OAuth sign-in and No sign-in ----------
{
  const { ctx, p, errs } = await open({ width: 1280, height: 900 });
  let servers = [];
  let started = null;
  await ctx.route("**/api/mcp/list", (r) => r.fulfill({ json: { servers } }));
  await ctx.route("**/api/mcp/discover", (r) => { const u = r.request().postDataJSON().url; r.fulfill({ json: u.includes("composio") ? { auth: "oauth", dcr: true, cimd: false, scopes: ["tools"] } : { auth: "none", dcr: false } }); });
  await ctx.route("**/api/mcp/oauth-start", (r) => { started = r.request().postDataJSON(); r.fulfill({ json: { authorizeUrl: "https://auth.example.test/authorize?client_id=cid" } }); });
  await ctx.route("https://auth.example.test/**", (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<h1>Sign in to Composio</h1>" }));
  await ctx.route("**/api/mcp/add", (r) => { const b = r.request().postDataJSON(); servers = [{ id: "docs", name: b.name, url: b.url, toolCount: 3, tools: [], auth: "none" }]; r.fulfill({ json: { ok: true, server: servers[0] } }); });
  await p.goto(B + "dev.html"); await p.waitForTimeout(900);
  await p.locator("#dev-app #model-btn").first().click().catch(() => {});
  const openConnections = async () => {
    if (!(await p.locator("dialog[open] [data-tab=connections]").count())) await p.evaluate(() => window.FIZZ.settings?.open ? 0 : 0);
    await p.locator("dialog[open] [data-tab=connections]").click();
    await p.waitForSelector("dialog[open] [data-cc-open]", { timeout: 10000 });
  };
  await openConnections();
  // No sign-in path
  await p.click("dialog[open] [data-cc-open]");
  await p.fill(".cc-dlg [name=name]", "Docs");
  await p.fill(".cc-dlg [name=url]", "https://docs.example.test/mcp");
  await p.click('.cc-dlg [data-cc="continue"]');
  await p.waitForSelector('.cc-dlg input[name=auth][value=none]:checked', { timeout: 10000 }).then(() => check("connector: open server detected as No sign-in", true)).catch(() => check("connector: open server detected as No sign-in", false));
  check("connector: no OAuth client section without sign-in", (await p.locator(".cc-dlg input[name=client]").count()) === 0);
  await p.click('.cc-dlg [data-cc="add"]');
  await p.waitForFunction(() => !document.querySelector(".cc-dlg[open]"), null, { timeout: 10000 }).then(() => check("connector: added without sign-in", true)).catch(() => check("connector: added without sign-in", false));
  await p.waitForFunction(() => document.querySelector("dialog[open] [data-cc-list]")?.innerText.includes("Docs"), null, { timeout: 8000 }).then(() => check("connector: listed under Custom connectors", true)).catch(() => check("connector: listed under Custom connectors", false));
  // OAuth path (like Composio)
  await p.click("dialog[open] [data-cc-open]");
  await p.fill(".cc-dlg [name=name]", "Composio");
  await p.fill(".cc-dlg [name=url]", "https://connect.composio.test/mcp");
  await p.click('.cc-dlg [data-cc="continue"]');
  await p.waitForSelector('.cc-dlg input[name=auth][value=now]:checked', { timeout: 10000 });
  const step2 = await p.locator(".cc-dlg").innerText();
  check("connector: sign-in detected and pre-selected", /Sign in now\s*Detected/.test(step2), step2.slice(0, 160));
  check("connector: automatic registration detected", /Register automatically\s*Detected/.test(step2));
  await p.click('.cc-dlg [data-cc="header"]');
  await p.fill('.cc-dlg [data-hk="0"]', "X-Team");
  await p.fill('.cc-dlg [data-hv="0"]', "abc");
  await p.locator(".cc-dlg summary").click();
  await p.fill(".cc-dlg [name=scope]", "tools");
  await p.click('.cc-dlg [data-cc="add"]');
  await p.waitForURL(/auth\.example\.test/, { timeout: 10000 }).then(() => check("connector: Add opens the server's sign-in page", true)).catch(() => check("connector: Add opens the server's sign-in page", false));
  check("connector: sends name, URL, headers and scope", started?.name === "Composio" && started?.headers?.["X-Team"] === "abc" && started?.scope === "tools" && started?.returnTo === "/dev.html", JSON.stringify(started));
  // Back from sign-in
  await p.goto(B + "dev.html?mcp_connected=Composio"); await p.waitForTimeout(1500);
  check("connector: confirms after sign-in", (await p.locator("#fizz-toast, .toast").allInnerTexts().catch(() => [])).join(" ").includes("Composio is connected") || (await p.evaluate(() => document.body.innerText.includes("Composio is connected"))));
  check("connector: cleans the URL", !p.url().includes("mcp_connected"));
  check("connector: no script errors", !errs.length, errs.join(" | "));
  await ctx.close();
}

// ---------- Automatic mode: questions are answered, builds are built, connectors are listed ----------
{
  const { ctx, p, errs, bodies, script } = await open({ width: 1280, height: 800 });
  await ctx.route("**/api/mcp/list", (r) => r.fulfill({ json: { servers: [{ id: "composio", name: "Composio", url: "https://connect.composio.dev/mcp", toolCount: 3, auth: "oauth", tools: [{ name: "COMPOSIO_MANAGE_CONNECTIONS" }, { name: "COMPOSIO_SEARCH_TOOLS" }, { name: "COMPOSIO_MULTI_EXECUTE_TOOL" }] }] } }));
  await p.goto(B + "dev.html"); await p.waitForTimeout(900);
  check("no mode buttons in the composer", (await p.locator("#dev-app .mode").count()) === 0);
  script.push("You're connected to Composio.");
  await p.fill("#dev-app #input", "למה אני מחובר מהconnectors?"); await p.keyboard.press("Enter");
  await lastReply(p, "#dev-app", "connected to Composio");
  const sys = bodies[0]?.system || "";
  check("auto: a Hebrew question is answered (Ask)", sys.includes("ASK MODE") && !sys.includes("BUILD MODE"));
  check("auto: connections are in the prompt", sys.includes("CONNECTIONS") && sys.includes("Composio (custom connector / MCP server)"));
  check("auto: gateway connectors are explained", /call COMPOSIO_MANAGE_CONNECTIONS.*first/.test(sys));
  check("auto: no checks or files for a question", (await p.locator("#dev-app .verify-note").count()) === 0);
  script.push('<fizz-file path="index.html">\n<!doctype html><html><head><meta name="viewport" content="width=device-width"></head><body><h1>Snake</h1></body></html>\n</fizz-file>\nBuilt.');
  await p.fill("#dev-app #input", "תבנה לי משחק נחש"); await p.keyboard.press("Enter");
  await lastReply(p, "#dev-app", "Built.");
  check("auto: a build request builds", (bodies.at(-1)?.system || bodies.find((b) => b.system?.includes("BUILD MODE"))?.system || "").includes("BUILD MODE"));
  // The + menu
  await p.click("#dev-app #attach");
  const sheet = await p.locator(".plus-sheet").innerText();
  check("+ menu: files, photos, camera, drive", ["Files", "Photos", "Camera", "Drive"].every((x) => sheet.includes(x)));
  check("+ menu: mode, connectors, skills, permissions, research", ["Mode", "Connectors", "Skills", "Permissions", "Research"].every((x) => sheet.includes(x)));
  await p.click('.plus-sheet [data-ps-go="connectors"]');
  check("+ menu: connectors list Composio", (await p.locator(".plus-sheet").innerText()).includes("Composio"));
  await p.click('.plus-sheet [data-ps="back"]');
  await p.click('.plus-sheet [data-ps-opt="research"]');
  check("+ menu: research toggles on", await p.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find((k) => k.startsWith("fizz.data.")))).settings.research === true));
  await p.keyboard.press("Escape");
  check("+ menu closes with Escape", (await p.locator(".plus-sheet").count()) === 0);
  check("auto: no script errors", !errs.length, errs.join(" | "));
  await ctx.close();
}

// ---------- Cloud browser: searches open in real Chrome, the screen reconnects after leaving ----------
{
  const { ctx, p, errs } = await open({ width: 1280, height: 800 });
  await ctx.route("**/api/status", (r) => r.fulfill({ json: { server: true, apps: [], ai: { configured: true, model: "test-model", dailyLimit: 50 }, connections: {}, google: {}, tools: { search: "wikipedia", browser: true } } }));
  const calls = [];
  let asleep = false;
  const tabsFor = (url) => [{ id: "T1", title: "Search", url, active: true, stream: "https://sb.test/stream?token=x&target=T1", input: "https://sb.test/input?token=x&target=T1" }];
  await ctx.route("**/api/browser", (r) => {
    const b = r.request().postDataJSON(); calls.push(b);
    if (b.action === "warm") return r.fulfill({ json: { ready: true } });
    if (b.action === "live") return r.fulfill({ json: asleep ? { starting: true } : { pages: tabsFor("https://duckduckgo.com/?q=snake"), engine: "sandbox" } });
    r.fulfill({ json: { text: "ok", page: { url: b.url, title: "Search" }, elements: [], tabs: tabsFor(b.url), engine: "sandbox" } });
  });
  const shots = [], direct = [];
  await ctx.route("https://sb.test/**", (r) => {
    const u = new URL(r.request().url());
    if (u.pathname === "/tabs") { direct.push("tabs"); return asleep ? r.abort() : r.fulfill({ json: { tabs: [{ id: "T1", title: "Page", url: "https://duckduckgo.com/?q=snake" }] } }); }
    if (u.pathname === "/navigate") { direct.push(`navigate ${r.request().postDataJSON().url}`); return r.fulfill({ json: { ok: true, id: "T1" } }); }
    if (u.pathname === "/input") { direct.push(`input ${r.request().postDataJSON().type}`); return r.fulfill({ json: { ok: true } }); }
    shots.push(r.request().url()); r.fulfill({ status: 200, contentType: "image/jpeg", body: Buffer.from("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==", "base64") }); });
  await p.goto(B + "dev.html"); await p.waitForTimeout(800);
  await p.click('#dev-app [data-tab="browser"]');
  await p.click("#br-new");
  await p.waitForTimeout(300);
  check("browser: opening the Browser tab wakes the cloud browser", calls.some((c) => c.action === "warm"));
  await p.fill("#br-url", "snake game"); await p.keyboard.press("Enter");
  await p.waitForFunction(() => !document.querySelector("#br-screen")?.hidden, null, { timeout: 8000 });
  const open1 = calls.find((c) => c.action === "open");
  check("browser: a search opens a real search engine in Chrome", open1?.url === "https://duckduckgo.com/?q=snake%20game", open1?.url);
  check("browser: the address bar uses the fast open (no page reading)", open1?.fast === true);
  check("browser: the live picture is sized for the panel", /&w=\d+&h=\d+&q=\d+/.test(shots[0] || ""), shots[0]);
  // Once it runs, navigation goes straight to the browser — no server round trip.
  const opens = calls.filter((c) => c.action === "open").length;
  await p.fill("#br-url", "wikipedia.org"); await p.keyboard.press("Enter");
  await p.waitForTimeout(500);
  check("browser: next address goes straight to the cloud browser", direct.includes("navigate https://wikipedia.org") && calls.filter((c) => c.action === "open").length === opens, direct.join(","));
  await p.click("#br-back").catch(() => {});
  await p.waitForTimeout(300);
  check("browser: back goes straight to the browser", direct.includes("input back") || !(await p.locator("#br-back").count()), direct.join(","));
  // Leave (another pane, the app in the background) and come back: the screen reconnects.
  const before = shots.length;
  await p.click('#dev-app [data-tab="code"]'); await p.waitForTimeout(200);
  await p.click('#dev-app [data-tab="browser"]');
  for (let i = 0; i < 20 && shots.length <= before; i++) await p.waitForTimeout(150);
  check("browser: coming back to the tab reconnects the screen", shots.length > before);
  // The browser went to sleep while away: it shows "starting", then reconnects when it's back.
  asleep = true;
  const n = shots.length;
  await p.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await p.waitForSelector(".br-starting", { timeout: 5000 }).catch(() => {});
  check("browser: a sleeping cloud browser shows that it's starting", (await p.locator(".br-starting").count()) === 1);
  asleep = false;
  await p.waitForFunction(() => !document.querySelector(".br-starting"), null, { timeout: 8000 }).catch(() => {});
  await p.waitForTimeout(300);
  for (let i = 0; i < 20 && shots.length <= n + 1; i++) await p.waitForTimeout(150);
  check("browser: after waking up the screen reconnects (no black screen)", (await p.locator(".br-starting").count()) === 0 && shots.length > n + 1);
  check("browser: no script errors", !errs.length, errs.join(" | "));
  await ctx.close();
}

// ---------- Gemini: a model Google retired switches to one the key has ----------
{
  const { ctx, p, errs } = await open({ width: 1280, height: 800 });
  const asked = [];
  await ctx.route("https://generativelanguage.googleapis.com/v1beta/models?**", (r) => r.fulfill({ json: { models: [
    { name: "models/gemini-2.0-flash", supportedGenerationMethods: ["generateContent"] },
    { name: "models/gemini-9.9-flash", supportedGenerationMethods: ["generateContent"] },
    { name: "models/gemini-9.9-flash-preview", supportedGenerationMethods: ["generateContent"] },
    { name: "models/text-embedding-004", supportedGenerationMethods: ["embedContent"] },
  ] } }));
  await ctx.route("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", (r) => {
    const m = r.request().postDataJSON().model; asked.push(m);
    if (m === "gemini-old") return r.fulfill({ status: 404, json: { error: { message: "model not found" } } });
    r.fulfill({ status: 200, headers: { "content-type": "text/event-stream" }, body: sse("Hello from the new model.") });
  });
  await p.goto(B + "chat.html"); await p.waitForTimeout(500);
  await p.evaluate(() => { const k = Object.keys(localStorage).find((x) => x.startsWith("fizz.data.")); const d = JSON.parse(localStorage.getItem(k) || "{}"); d.settings = { ...(d.settings || {}), provider: "gemini", geminiKey: "test-key", geminiModel: "gemini-old" }; localStorage.setItem(k, JSON.stringify(d)); });
  await p.reload(); await p.waitForTimeout(600);
  await p.locator("#chat-app #input, [data-app=chat] #input").first().fill("hi"); await p.keyboard.press("Enter");
  await lastReply(p, "#chat-app", "Hello from the new model.").catch(() => {});
  check("gemini: a retired model falls back to the newest Flash the key has", asked.join(",") === "gemini-old,gemini-9.9-flash", asked.join(","));
  check("gemini: the reply arrives", (await p.locator("#chat-app").innerText()).includes("Hello from the new model."));
  await ctx.close();
}

// ---------- app switch keeps one page ----------
{
  const { ctx, p, errs } = await open({ width: 1280, height: 800 });
  await p.goto(B + "chat.html"); await p.waitForTimeout(700);
  const sw = p.locator('[data-switch="dev"], .switcher [data-app="dev"], a[href="dev.html"]').first();
  if (await sw.count()) { await sw.click(); await p.waitForTimeout(600); check("switch to FIZZ DEV shows the dev app", await p.locator("#dev-app").isVisible()); }
  check("switching has no script errors", !errs.length, errs.join(" | "));
  await ctx.close();
}

await browser.close();
server.close();
console.log(failures ? `\n${failures} check(s) failed` : "\nAll end-to-end checks passed");
process.exit(failures ? 1 : 0);
