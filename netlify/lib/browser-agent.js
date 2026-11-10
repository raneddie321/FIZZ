// FIZZ cloud browser agent — runs inside the user's Vercel Sandbox next to Chromium.
// It never exposes Chromium directly: every request needs the user's token.
//   GET  /health                 → { ok, chrome }
//   GET  /tabs                   → [{ id, title, url }]
//   GET  /frame.jpg?target=ID    → one screenshot
//   GET  /stream?target=ID       → live MJPEG stream of a tab (screencast)
//   POST /input?target=ID        → the user's clicks, scrolls and typing from FIZZ DEV
//   WS   /cdp                    → Chrome DevTools Protocol, for FIZZ's server (Fizz Code's actions)
// Started by netlify/lib/sandbox-browser.mjs; netlify/lib/browser-agent-src.mjs is generated from this file.
import http from "node:http";
import net from "node:net";
import { spawn } from "node:child_process";

const TOKEN = process.env.FIZZ_BR_TOKEN || "";
const PORT = Number(process.env.FIZZ_BR_PORT || 8080);
const CDP_PORT = 9222;
const PROFILE = process.env.FIZZ_BR_PROFILE || "/vercel/sandbox/fizz-browser/profile";
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
if (!TOKEN) { console.error("FIZZ_BR_TOKEN is required"); process.exit(1); }

let chrome = null;
let browserPath = "";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function devtools(path) { const res = await fetch("http://127.0.0.1:" + CDP_PORT + path); return res.json(); }

// @sparticuz/chromium's flags are made for AWS Lambda. Here:
//  • --single-process stays: measured in Vercel Sandbox, separate renderer processes crash on the first
//    cross-site navigation (the same kernel restriction as Lambda);
//  • never --disable-web-security / --allow-running-insecure-content: the user signs in to real sites here;
//  • a real disk cache (in the profile, which the sandbox keeps) so sites open faster the second time.
const DROP = /^--(disable-web-security|allow-running-insecure-content|disk-cache-size=.*)$/;
const FAST = ["--disk-cache-size=268435456", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows", "--disable-ipc-flooding-protection"];
const singleProcess = true;
async function launch(exe, base) {
  const args = base.filter((a) => !DROP.test(a)).concat(FAST, ["--remote-debugging-port=" + CDP_PORT, "--remote-debugging-address=127.0.0.1", "--window-size=1280,800", "--user-data-dir=" + PROFILE, "--user-agent=" + UA, "--lang=en-US", "--hide-scrollbars", "about:blank"]);
  const proc = spawn(exe, args, { stdio: "ignore", env: process.env });
  chrome = proc;
  proc.on("exit", () => { if (chrome === proc) { chrome = null; browserPath = ""; cdp = null; } });
  for (let i = 0; i < 60; i++) {
    if (chrome !== proc) break; // it exited
    try { const v = await devtools("/json/version"); browserPath = new URL(v.webSocketDebuggerUrl).pathname; return true; } catch { await sleep(200); }
  }
  try { proc.kill("SIGKILL"); } catch {}
  return false;
}
async function startChrome() {
  let exe = process.env.CHROME_PATH, base = [];
  if (!exe) {
    const chromium = (await import("@sparticuz/chromium")).default;
    exe = await chromium.executablePath();
    base = chromium.args;
  } else base = ["--headless=new", "--no-sandbox"];
  if (await launch(exe, base)) return;
  throw new Error("Chromium didn't start");
}
let starting = null;
/** One start at a time, however many requests arrive while Chromium boots. */
async function ensureChrome() {
  if (chrome && browserPath) return;
  starting ||= startChrome().finally(() => { starting = null; });
  await starting;
}

// ---------- one CDP connection for screencasts and input ----------
let cdp = null;
async function connectCdp() {
  await ensureChrome();
  if (cdp) return cdp;
  const ws = new WebSocket("ws://127.0.0.1:" + CDP_PORT + browserPath);
  await new Promise((ok, bad) => { ws.onopen = ok; ws.onerror = () => bad(new Error("CDP connection failed")); });
  let id = 0;
  const pending = new Map(), listeners = new Set(), sessions = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.bad(new Error(m.error.message)) : p.ok(m.result || {}); }
    else for (const l of listeners) l(m);
  };
  ws.onclose = () => { cdp = null; for (const p of pending.values()) p.bad(new Error("closed")); };
  const send = (method, params, sessionId) => new Promise((ok, bad) => { const i = ++id; pending.set(i, { ok, bad }); ws.send(JSON.stringify(sessionId ? { id: i, method, params: params || {}, sessionId } : { id: i, method, params: params || {} })); });
  async function session(targetId) {
    if (sessions.has(targetId)) return sessions.get(targetId);
    const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
    sessions.set(targetId, sessionId);
    return sessionId;
  }
  listeners.add((m) => { if (m.method === "Target.detachedFromTarget") for (const [t, s] of sessions) if (s === m.params.sessionId) sessions.delete(t); });
  cdp = { send, session, listeners };
  return cdp;
}
async function pages() { await ensureChrome(); return (await devtools("/json/list")).filter((t) => t.type === "page").map((t) => ({ id: t.id, title: t.title, url: t.url })); }
async function pickTarget(id) { const list = await pages(); return (list.find((t) => t.id === id) || list[0] || {}).id; }

// ---------- live stream (MJPEG) ----------
const streams = new Map(); // targetId → { clients:Set<res>, sessionId, last }
// The picture is sized for the screen showing it (a phone gets a smaller, lighter stream).
const streamOpts = (url) => ({
  w: Math.max(320, Math.min(1920, Number(url.searchParams.get("w")) || 1280)),
  h: Math.max(320, Math.min(1600, Number(url.searchParams.get("h")) || 800)),
  q: Math.max(30, Math.min(85, Number(url.searchParams.get("q")) || 62)),
});
async function startStream(targetId, opts = { w: 1280, h: 800, q: 62 }) {
  const c = await connectCdp();
  let s = streams.get(targetId);
  if (s) {
    // A bigger or sharper screen joined: restart the screencast at its size.
    if (opts.w > s.opts.w || opts.h > s.opts.h || opts.q > s.opts.q) {
      s.opts = { w: Math.max(opts.w, s.opts.w), h: Math.max(opts.h, s.opts.h), q: Math.max(opts.q, s.opts.q) };
      await c.send("Page.stopScreencast", {}, s.sessionId).catch(() => {});
      await c.send("Page.startScreencast", { format: "jpeg", quality: s.opts.q, maxWidth: s.opts.w, maxHeight: s.opts.h, everyNthFrame: 1 }, s.sessionId).catch(() => {});
    }
    return s;
  }
  const sessionId = await c.session(targetId);
  s = { clients: new Set(), sessionId, last: null };
  streams.set(targetId, s);
  c.listeners.add(s.on = (m) => {
    if (m.method !== "Page.screencastFrame" || m.sessionId !== sessionId) return;
    c.send("Page.screencastFrameAck", { sessionId: m.params.sessionId }, sessionId).catch(() => {});
    const jpg = Buffer.from(m.params.data, "base64");
    s.last = jpg;
    for (const res of s.clients) writeFrame(res, jpg);
  });
  s.opts = opts;
  await c.send("Page.startScreencast", { format: "jpeg", quality: opts.q, maxWidth: opts.w, maxHeight: opts.h, everyNthFrame: 1 }, sessionId);
  return s;
}
function writeFrame(res, jpg) { try { res.write("--frame\r\nContent-Type: image/jpeg\r\nContent-Length: " + jpg.length + "\r\n\r\n"); res.write(jpg); res.write("\r\n"); } catch {} }
async function stopStreamIfIdle(targetId) {
  const s = streams.get(targetId);
  if (!s || s.clients.size) return;
  streams.delete(targetId);
  if (cdp) { cdp.listeners.delete(s.on); cdp.send("Page.stopScreencast", {}, s.sessionId).catch(() => {}); }
}

// ---------- input from the user ----------
const KEYS = { Enter: 13, Tab: 9, Backspace: 8, Escape: 27, Delete: 46, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Home: 36, End: 35, PageUp: 33, PageDown: 34 };
async function input(targetId, e) {
  const c = await connectCdp();
  const sid = await c.session(targetId);
  const mods = (e.alt ? 1 : 0) | (e.ctrl ? 2 : 0) | (e.meta ? 4 : 0) | (e.shift ? 8 : 0);
  if (e.type === "click") {
    for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) await c.send("Input.dispatchMouseEvent", { type, x: e.x, y: e.y, button: "left", clickCount: e.count || 1, modifiers: mods }, sid);
  } else if (e.type === "move") await c.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: e.x, y: e.y }, sid);
  else if (e.type === "wheel") await c.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: e.x, y: e.y, deltaX: e.dx || 0, deltaY: e.dy || 0 }, sid);
  else if (e.type === "text") await c.send("Input.insertText", { text: String(e.text).slice(0, 5000) }, sid);
  else if (e.type === "key") {
    const code = KEYS[e.key] || (e.key && e.key.length === 1 ? e.key.toUpperCase().charCodeAt(0) : 0);
    const text = e.key === "Enter" ? "\r" : "";
    await c.send("Input.dispatchKeyEvent", { type: text ? "keyDown" : "rawKeyDown", key: e.key, code: e.code || e.key, windowsVirtualKeyCode: code, modifiers: mods, text: text || undefined }, sid);
    await c.send("Input.dispatchKeyEvent", { type: "keyUp", key: e.key, code: e.code || e.key, windowsVirtualKeyCode: code, modifiers: mods }, sid);
  } else if (e.type === "back" || e.type === "forward") {
    await c.send("Runtime.evaluate", { expression: "history." + e.type + "()" }, sid);
  } else if (e.type === "reload") await c.send("Page.reload", {}, sid);
}

// ---------- HTTP ----------
/** A public web address, or null: never this machine, its private network or cloud metadata. */
function webUrl(raw) {
  let u;
  try { u = new URL(String(raw || "").trim()); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  const h = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal") || h === "0.0.0.0" || h === "::1" || (/^f[cde]/.test(h) && h.includes(":"))) return null;
  const m = /^(\d+)\.(\d+)\.\d+\.\d+$/.exec(h);
  if (m) { const a = +m[1], b = +m[2]; if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)) return null; }
  return u.href;
}
const authed = (req, url) => (url.searchParams.get("token") || req.headers["x-fizz-token"]) === TOKEN;
const cors = (res) => { res.setHeader("Access-Control-Allow-Origin", "*"); res.setHeader("Access-Control-Allow-Headers", "content-type, x-fizz-token"); res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS"); };
const json = (res, code, data) => { res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" }); res.end(JSON.stringify(data)); };
const body = (req) => new Promise((ok) => { let s = ""; req.on("data", (d) => { s += d; if (s.length > 20000) req.destroy(); }); req.on("end", () => { try { ok(JSON.parse(s || "{}")); } catch { ok({}); } }); });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  cors(res);
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
  if (!authed(req, url)) return json(res, 401, { error: "unauthorized" });
  try {
    if (url.pathname === "/health") { await ensureChrome(); return json(res, 200, { ok: true, chrome: Boolean(browserPath), version: process.env.FIZZ_BR_VERSION || "", processes: singleProcess ? "single" : "multi" }); }
    if (url.pathname === "/tabs") return json(res, 200, { tabs: await pages() });
    // The user's own navigation goes straight here (one round trip); the live picture shows it loading.
    if (url.pathname === "/navigate" && req.method === "POST") {
      const b = await body(req);
      const to = webUrl(b.url);
      if (!to) return json(res, 400, { error: "Only web addresses (http or https) can be opened." });
      const c = await connectCdp();
      let id = b.newTab ? null : await pickTarget(url.searchParams.get("target"));
      if (!id) ({ targetId: id } = await c.send("Target.createTarget", { url: to }));
      else await c.send("Page.navigate", { url: to }, await c.session(id));
      return json(res, 200, { ok: true, id });
    }
    if (url.pathname === "/close" && req.method === "POST") {
      const list = await pages();
      const id = url.searchParams.get("target");
      if (list.length > 1 && list.some((t) => t.id === id)) await (await connectCdp()).send("Target.closeTarget", { targetId: id });
      return json(res, 200, { ok: true, tabs: await pages() });
    }
    const target = await pickTarget(url.searchParams.get("target"));
    if (!target) return json(res, 404, { error: "no tab" });
    if (url.pathname === "/frame.jpg") {
      const c = await connectCdp();
      const shot = await c.send("Page.captureScreenshot", { format: "jpeg", quality: 60 }, await c.session(target));
      res.writeHead(200, { "content-type": "image/jpeg", "cache-control": "no-store" });
      return res.end(Buffer.from(shot.data, "base64"));
    }
    if (url.pathname === "/stream") {
      const s = await startStream(target, streamOpts(url));
      res.writeHead(200, { "content-type": "multipart/x-mixed-replace; boundary=frame", "cache-control": "no-store", connection: "keep-alive", "x-accel-buffering": "no" });
      s.clients.add(res);
      if (s.last) writeFrame(res, s.last);
      else {
        const c = await connectCdp();
        const shot = await c.send("Page.captureScreenshot", { format: "jpeg", quality: 60 }, await c.session(target)).catch(() => null);
        if (shot) writeFrame(res, Buffer.from(shot.data, "base64"));
      }
      req.on("close", () => { s.clients.delete(res); stopStreamIfIdle(target); });
      return;
    }
    if (url.pathname === "/input" && req.method === "POST") { await input(target, await body(req)); return json(res, 200, { ok: true }); }
    json(res, 404, { error: "not found" });
  } catch (e) { json(res, 500, { error: String(e && e.message || e) }); }
});

// Chrome DevTools Protocol for FIZZ's server, behind the token.
server.on("upgrade", async (req, socket, head) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname !== "/cdp" || !authed(req, url)) { socket.end("HTTP/1.1 401 Unauthorized\r\n\r\n"); return; }
  try { await ensureChrome(); } catch { socket.end("HTTP/1.1 503 Service Unavailable\r\n\r\n"); return; }
  const upstream = net.connect(CDP_PORT, "127.0.0.1", () => {
    const keep = ["upgrade", "connection", "sec-websocket-key", "sec-websocket-version", "sec-websocket-extensions"];
    const lines = ["GET " + browserPath + " HTTP/1.1", "Host: 127.0.0.1:" + CDP_PORT];
    for (const k of keep) if (req.headers[k]) lines.push(k + ": " + req.headers[k]);
    upstream.write(lines.join("\r\n") + "\r\n\r\n");
    if (head && head.length) upstream.write(head);
    upstream.pipe(socket);
    socket.pipe(upstream);
  });
  const close = () => { upstream.destroy(); socket.destroy(); };
  upstream.on("error", close);
  socket.on("error", close);
});

// When the agent is stopped (e.g. replaced by a newer one), its Chromium goes with it.
for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => { try { chrome && chrome.kill("SIGKILL"); } catch {} process.exit(0); });

server.listen(PORT, "0.0.0.0", () => console.log("fizz browser agent on " + PORT));
ensureChrome().catch((e) => console.error(e));
