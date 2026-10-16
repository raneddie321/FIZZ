// Fizz Code's cloud browser (Browserbase): a real Chrome in the cloud that the AI drives over CDP and the
// user sees and uses through Browserbase's live view inside FIZZ DEV. Logins are kept in a per-user
// Browserbase context. Safety: the AI can't type into password fields (the user types those in the live
// view), and pages with a CAPTCHA are flagged so the AI hands over to the user.
import { attach, connect, pages } from "./cdp.mjs";
import { env } from "./util.mjs";

const BB = "https://api.browserbase.com/v1";
export const browserConfigured = () => Boolean(env("BROWSERBASE_API_KEY"));

async function bb(path, init = {}) {
  const res = await fetch(`${BB}${path}`, { ...init, headers: { "X-BB-API-Key": env("BROWSERBASE_API_KEY"), ...(init.body ? { "Content-Type": "application/json" } : {}) }, signal: AbortSignal.timeout(20000) });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw Object.assign(new Error(`Cloud browser: ${data?.message || data?.error || `error ${res.status}`}`), { status: res.status === 429 ? 429 : 502, bbStatus: res.status });
  return data;
}
const project = () => (env("BROWSERBASE_PROJECT_ID") ? { projectId: env("BROWSERBASE_PROJECT_ID") } : {});

export async function createContext() {
  const c = await bb("/contexts", { method: "POST", body: JSON.stringify(project()) });
  return c.id;
}

/** Starts a session that keeps the user's logins (context). Falls back to a plain session if the plan has no keep-alive. */
export async function createSession(contextId) {
  const body = {
    ...project(),
    keepAlive: true,
    timeout: Number(env("FIZZ_BROWSER_MINUTES") || 30) * 60,
    browserSettings: { viewport: { width: 1280, height: 800 }, blockAds: true, ...(contextId ? { context: { id: contextId, persist: true } } : {}) },
  };
  let s;
  try { s = await bb("/sessions", { method: "POST", body: JSON.stringify(body) }); } catch (e) {
    if (e.bbStatus !== 400 && e.bbStatus !== 402 && e.bbStatus !== 403) throw e;
    delete body.keepAlive;
    s = await bb("/sessions", { method: "POST", body: JSON.stringify(body) });
  }
  return { sessionId: s.id, connectUrl: s.connectUrl };
}
export async function sessionRunning(sessionId) {
  try { const s = await bb(`/sessions/${sessionId}`); return s.status === "RUNNING"; } catch { return false; }
}
export const releaseSession = (sessionId) => bb(`/sessions/${sessionId}`, { method: "POST", body: JSON.stringify({ ...project(), status: "REQUEST_RELEASE" }) }).catch(() => null);
/** Live view links for each tab, to show in FIZZ DEV (the user can click and type in them). */
export async function liveViews(sessionId) {
  const d = await bb(`/sessions/${sessionId}/debug`);
  return { main: d.debuggerFullscreenUrl, pages: (d.pages || []).map((p) => ({ id: p.id, url: p.url, title: p.title, live: p.debuggerFullscreenUrl })) };
}

// ---------- page scripts (run inside the page) ----------
function readPage(max) {
  for (const el of document.querySelectorAll("[data-fizz-id]")) el.removeAttribute("data-fizz-id");
  const sel = 'a[href],button,input:not([type=hidden]),textarea,select,summary,[role=button],[role=link],[role=tab],[role=menuitem],[role=option],[role=checkbox],[role=radio],[role=switch],[role=combobox],[contenteditable=""],[contenteditable=true],[onclick],[tabindex]:not([tabindex="-1"])';
  const out = [];
  let n = 0;
  for (const el of document.querySelectorAll(sel)) {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || r.bottom < -innerHeight || r.top > innerHeight * 3) continue;
    const st = getComputedStyle(el);
    if (st.visibility === "hidden" || st.display === "none" || Number(st.opacity) === 0) continue;
    const id = ++n;
    el.setAttribute("data-fizz-id", String(id));
    const lab = el.labels && el.labels[0] ? el.labels[0].innerText : "";
    const label = (el.getAttribute("aria-label") || lab || (el.tagName === "INPUT" || el.tagName === "TEXTAREA" ? el.placeholder || el.name : el.innerText) || el.value || el.title || el.getAttribute("alt") || "").trim().replace(/\s+/g, " ").slice(0, 80);
    out.push({ id, tag: el.tagName.toLowerCase(), type: (el.getAttribute("type") || "").toLowerCase(), role: el.getAttribute("role") || "", label, href: el.tagName === "A" ? String(el.href).slice(0, 140) : "", value: el.type === "password" ? "" : String(el.value ?? "").slice(0, 40), checked: el.checked === true, inView: r.top >= 0 && r.bottom <= innerHeight });
    if (out.length >= 160) break;
  }
  const text = (document.body ? document.body.innerText : "").replace(/[ \t]+/g, " ").replace(/\n\s*\n\s*\n+/g, "\n\n").trim();
  const captcha = !!document.querySelector('iframe[src*="recaptcha"],iframe[src*="hcaptcha"],iframe[src*="challenges.cloudflare.com"],iframe[title*="captcha" i],.g-recaptcha,.h-captcha,#challenge-running,#cf-challenge-running');
  return { url: location.href, title: document.title, text: text.slice(0, max), more: text.length > max, elements: out, captcha, scroll: { y: Math.round(scrollY), height: document.documentElement.scrollHeight, view: innerHeight } };
}
function locate(id) {
  const el = document.querySelector(`[data-fizz-id="${id}"]`);
  if (!el) return null;
  el.scrollIntoView({ block: "center", inline: "center" });
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, tag: el.tagName.toLowerCase(), type: (el.getAttribute("type") || "").toLowerCase(), autocomplete: (el.getAttribute("autocomplete") || "").toLowerCase(), label: (el.getAttribute("aria-label") || el.innerText || el.placeholder || el.name || "").trim().slice(0, 60) };
}
function clearField(id) {
  const el = document.querySelector(`[data-fizz-id="${id}"]`);
  if (!el) return false;
  el.focus();
  if ("value" in el) { el.select?.(); } else { const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
  return true;
}

/** What the AI gets back after every action. */
export function describe(p) {
  const lines = [`Page: ${p.title || "(no title)"} — ${p.url}`];
  if (p.captcha) lines.push("⚠ This page shows a CAPTCHA / bot check. Don't try to solve it: hand over to the user with action=\"handoff\".");
  lines.push(`Scrolled ${p.scroll.y}px of ${p.scroll.height}px (window ${p.scroll.view}px).`);
  lines.push("", "Elements (use the number with click / type / select):");
  for (const e of p.elements) {
    const kind = e.tag === "a" ? "link" : e.tag === "input" ? `input${e.type ? `:${e.type}` : ""}` : e.role || e.tag;
    lines.push(`[${e.id}] ${kind} "${e.label}"${e.href ? ` → ${e.href}` : ""}${e.value ? ` (value: "${e.value}")` : ""}${e.checked ? " (checked)" : ""}${e.inView ? "" : " (off screen)"}`);
  }
  lines.push("", "Text:", p.text + (p.more ? "\n[More text below — scroll down to read it.]" : ""));
  return lines.join("\n");
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function settle(tab, ms = 12000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const state = await tab.evaluate(() => document.readyState).catch(() => "loading");
    if (state === "complete") break;
    await sleep(300);
  }
  await sleep(500);
}
const KEYS = { Enter: [13, "\r"], Tab: [9, ""], Escape: [27, ""], Backspace: [8, ""], ArrowDown: [40, ""], ArrowUp: [38, ""], ArrowLeft: [37, ""], ArrowRight: [39, ""], PageDown: [34, ""], PageUp: [33, ""], Space: [32, " "] };
async function press(tab, key) {
  const [code, text] = KEYS[key] || [0, ""];
  if (!code) throw Object.assign(new Error(`Unknown key "${key}". Use ${Object.keys(KEYS).join(", ")}.`), { status: 400 });
  const k = key === "Space" ? " " : key;
  await tab.send("Input.dispatchKeyEvent", { type: text ? "keyDown" : "rawKeyDown", key: k, code: key === "Space" ? "Space" : key, windowsVirtualKeyCode: code, text: text || undefined });
  await tab.send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code: key === "Space" ? "Space" : key, windowsVirtualKeyCode: code });
}
async function clickAt(tab, x, y) {
  await tab.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await tab.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await tab.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
}
// Verification codes the user gave in the chat may be typed; passwords and card details never.
const SECRET_FIELD = (l) => l.type === "password" || /(^|\s)(current-password|new-password|cc-number|cc-csc|cc-exp)$/.test(l.autocomplete) || /card number|cvv|cvc|security code|סיסמה/i.test(l.label);

/**
 * Runs one action. state = { sessionId, connectUrl, active } (the active tab id); returns { state, page, text, screenshot? }.
 * Actions: open(url, newTab) · click(id) · type(id, text, enter, clear) · select(id, value) · key(key) · scroll(direction, amount)
 * back · forward · reload · read · screenshot · tabs · switch(tab) · close(tab)
 */
export async function act(state, a) {
  const cdp = await connect(state.connectUrl);
  try {
    let list = await pages(cdp);
    if (!list.length) { const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" }); list = await pages(cdp); state.active = targetId; }
    if (a.tab && !["switch", "close"].includes(a.action) && list.some((t) => t.targetId === a.tab)) state.active = a.tab;
    if (!list.some((t) => t.targetId === state.active)) state.active = list[0].targetId;
    const before = new Set(list.map((t) => t.targetId));
    let tab = await attach(cdp, state.active);
    const max = Math.min(20000, Number(a.max) || 7000);
    let note = "";
    switch (a.action) {
      case "open": {
        let url = String(a.url || "").trim();
        if (!/^https?:\/\//i.test(url)) url = /^[\w-]+(\.[\w-]+)+(\/|$)/.test(url) ? `https://${url}` : `https://duckduckgo.com/?q=${encodeURIComponent(url)}`;
        if (a.newTab) {
          const { targetId } = await cdp.send("Target.createTarget", { url });
          state.active = targetId;
          tab = await attach(cdp, targetId);
        } else await tab.send("Page.navigate", { url });
        await settle(tab);
        break;
      }
      case "click": {
        const at = await tab.evaluate(locate, String(a.id));
        if (!at) throw Object.assign(new Error(`There's no element [${a.id}] on the page any more. Read the page again.`), { status: 400 });
        await sleep(150);
        await clickAt(tab, at.x, at.y);
        await sleep(900);
        const now = await pages(cdp);
        const opened = now.find((t) => !before.has(t.targetId));
        if (opened) { state.active = opened.targetId; tab = await attach(cdp, opened.targetId); note = "The click opened a new tab; you're on it now."; }
        await settle(tab, 8000);
        break;
      }
      case "type": {
        const at = await tab.evaluate(locate, String(a.id));
        if (!at) throw Object.assign(new Error(`There's no element [${a.id}] on the page any more. Read the page again.`), { status: 400 });
        if (SECRET_FIELD(at)) throw Object.assign(new Error("That's a password or payment field. Fizz Code never types those: ask the user to type it in the browser (action=\"handoff\")."), { status: 400, code: "secret_field" });
        await clickAt(tab, at.x, at.y);
        if (a.clear !== false) await tab.evaluate(clearField, String(a.id));
        await tab.send("Input.insertText", { text: String(a.text ?? "").slice(0, 2000) });
        if (a.enter) { await press(tab, "Enter"); await settle(tab, 8000); } else await sleep(300);
        break;
      }
      case "select": {
        const ok = await tab.evaluate(({ id, value }) => {
          const el = document.querySelector(`[data-fizz-id="${id}"]`);
          if (!el || el.tagName !== "SELECT") return false;
          const opt = [...el.options].find((o) => o.value === value || o.text.trim().toLowerCase() === String(value).toLowerCase());
          if (!opt) return false;
          el.value = opt.value;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
          return true;
        }, { id: String(a.id), value: String(a.value ?? "") });
        if (!ok) throw Object.assign(new Error(`Couldn't choose “${a.value}” in [${a.id}].`), { status: 400 });
        await sleep(400);
        break;
      }
      case "key": await press(tab, String(a.key || "Enter")); await settle(tab, 6000); break;
      case "scroll": {
        const dy = (a.direction === "up" ? -1 : 1) * Math.min(5000, Number(a.amount) || 650);
        await tab.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: 640, y: 400, deltaX: 0, deltaY: dy });
        await sleep(700);
        break;
      }
      case "back": case "forward": await tab.evaluate((d) => history[d](), a.action); await settle(tab, 8000); break;
      case "reload": await tab.send("Page.reload", {}); await settle(tab); break;
      case "switch": {
        const t = list.find((x) => x.targetId === a.tab);
        if (!t) throw Object.assign(new Error("That tab isn't open any more."), { status: 400 });
        await cdp.send("Target.activateTarget", { targetId: t.targetId });
        state.active = t.targetId;
        tab = await attach(cdp, t.targetId);
        break;
      }
      case "close": {
        const id = a.tab || state.active;
        if (list.length > 1) {
          await cdp.send("Target.closeTarget", { targetId: id });
          list = await pages(cdp);
          if (state.active === id) state.active = list[0].targetId;
          tab = await attach(cdp, state.active);
        }
        break;
      }
      case "read": case "screenshot": case "tabs": break;
      default: throw Object.assign(new Error(`Unknown browser action "${a.action}".`), { status: 400 });
    }
    const page = await tab.evaluate(readPage, max);
    const out = { state, page, text: (note ? note + "\n" : "") + describe(page) };
    if (a.action === "screenshot" || a.shot) {
      const shot = await tab.send("Page.captureScreenshot", { format: "jpeg", quality: 60 });
      out.screenshot = `data:image/jpeg;base64,${shot.data}`;
    }
    out.tabs = (await pages(cdp)).map((t) => ({ id: t.targetId, title: t.title, url: t.url, active: t.targetId === state.active }));
    return out;
  } finally {
    cdp.close();
  }
}
