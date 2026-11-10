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
  await p.click('#dev-app .mode [data-mode="do"]');
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
