import { env, error, getCookie, json, readJson, sameOrigin, seal, setCookie, unseal } from "../lib/util.mjs";
import { requireUser } from "../lib/auth.mjs";
import { kvConfigured, quotaCounter, redis, today } from "../lib/kv.mjs";
import { act, browserConfigured, createContext, createSession, liveViews, releaseSession, sessionRunning } from "../lib/browser.mjs";
import { cdpUrl, ensureBrowser, sandboxBrowserEnabled, sandboxTabs } from "../lib/sandbox-browser.mjs";

/** Which cloud browser this site uses: Browserbase when its key is set, else FIZZ's own (Vercel Sandbox). */
export const browserEngine = () => (browserConfigured() ? "browserbase" : sandboxBrowserEnabled() ? "sandbox" : null);
const pageJson = (out) => ({ text: out.text, page: { url: out.page.url, title: out.page.title, captcha: out.page.captcha }, elements: out.page.elements.map((e) => ({ id: e.id, label: e.label, tag: e.tag, type: e.type })), screenshot: out.screenshot });

/** FIZZ's own cloud browser in the user's sandbox. The active tab is remembered in a cookie. */
async function sandboxEngine(req, uid, body, headers) {
  const action = String(body.action || "");
  let st = unseal(getCookie(req, "fizz_br2"));
  if (st && st.uid !== uid) st = null;
  st ||= { uid, active: null };
  if (action === "release") return json({ released: true });
  let b;
  try { b = await ensureBrowser(uid, { waitMs: action === "live" ? 8000 : 35000 }); }
  catch (e) {
    console.error("[browser:sandbox]", e);
    const m = String(e.message || e);
    const hint = /oidc|token|unauthori[sz]ed|401|403|forbidden/i.test(m) ? " Vercel didn't let this project start a sandbox: check that Vercel Sandbox is available on the account (vercel.com → the project → Sandbox) and redeploy."
      : /quota|limit|exceed|402|payment/i.test(m) ? " The Vercel Sandbox limit for this account has been reached for now."
      : "";
    throw Object.assign(new Error(`The cloud browser couldn't start: ${m.slice(0, 300)}.${hint}`), { status: 502, code: "sandbox_failed" });
  }
  if (b.starting) return json({ starting: true, text: "The cloud browser is starting (the first time takes about a minute)." });
  if (action === "live") return json({ pages: await sandboxTabs(b.base, b.token), active: st.active, engine: "sandbox" });
  const out = await act({ connectUrl: cdpUrl(b.base, b.token), active: st.active }, body);
  st.active = out.state.active;
  setCookie(headers, "fizz_br2", seal(st), { maxAge: 60 * 60 * 24 * 30 });
  const views = await sandboxTabs(b.base, b.token).catch(() => []);
  const tabs = out.tabs.map((t) => { const v = views.find((x) => x.id === t.id); return { ...t, stream: v?.stream || null, input: v?.input || null }; });
  return json({ ...pageJson(out), tabs, engine: "sandbox" }, { headers });
}

// The cloud browser for Fizz Code and the FIZZ DEV Browser tab: Browserbase, or FIZZ's own in Vercel Sandbox.
// The session lives in an encrypted cookie on this device; the login context (saved cookies of the
// sites the user signed in to) is kept per RanEddie ID user in Upstash when it's connected.
const COOKIE = "fizz_br";
const ctxKey = (uid) => `fizz-browser-context:${uid}`;

async function contextFor(uid, cookieCtx) {
  if (kvConfigured()) {
    const [saved] = await redis([["GET", ctxKey(uid)]]);
    if (saved) return saved;
  } else if (cookieCtx) return cookieCtx;
  const id = await createContext();
  if (kvConfigured()) await redis([["SET", ctxKey(uid), id]]);
  return id;
}

export default async (req) => {
  const engine = browserEngine();
  if (!engine) return error(503, "The cloud browser isn't turned on for this site. The site owner sets FIZZ_SANDBOX=on in Vercel (or adds BROWSERBASE_API_KEY).", "not_configured");
  if (req.method !== "POST") return error(405, "Use POST.");
  if (!sameOrigin(req)) return error(403, "Not allowed.");
  const who = await requireUser(req);
  if (who.response) return who.response;
  const uid = who.userId;
  const headers = new Headers();
  try {
    const body = await readJson(req, 20_000);
    const action = String(body.action || "");
    if (engine === "sandbox") {
      if (action !== "live" && action !== "release" && !(await quotaCounter()(`${today()}/browser/${uid}`, Number(env("FIZZ_BROWSER_LIMIT") || 600)))) return error(429, "You've reached today's limit for the cloud browser. Try again tomorrow.", "quota");
      return await sandboxEngine(req, uid, body, headers);
    }
    let st = unseal(getCookie(req, COOKIE));
    if (st && st.uid !== uid) st = null;

    if (action === "release") {
      if (st?.sessionId) await releaseSession(st.sessionId);
      setCookie(headers, COOKIE, seal({ uid, contextId: st?.contextId }), { maxAge: 60 * 60 * 24 * 365 });
      return json({ released: true }, { headers });
    }
    if (action === "live" && !st?.sessionId) return json({ main: null, pages: [], active: null });
    if (action !== "live" && !(await quotaCounter()(`${today()}/browser/${uid}`, Number(env("FIZZ_BROWSER_LIMIT") || 600)))) return error(429, "You've reached today's limit for the cloud browser. Try again tomorrow.", "quota");

    let fresh = false;
    const stale = Boolean(st?.sessionId) && Date.now() - (st.checked || 0) > 60_000 && !(await sessionRunning(st.sessionId));
    if (action === "live" && stale) return json({ main: null, pages: [], active: null, ended: true });
    if (!st?.sessionId || stale) {
      const contextId = await contextFor(uid, st?.contextId);
      st = { uid, contextId, ...(await createSession(contextId)), active: null };
      fresh = true;
    }
    if (action === "live") {
      const views = await liveViews(st.sessionId);
      st.checked = Date.now();
      setCookie(headers, COOKIE, seal(st), { maxAge: 60 * 60 * 24 * 365 });
      return json({ ...views, active: st.active, fresh }, { headers });
    }
    let out;
    try { out = await act(st, body); } catch (e) {
      // A session that ended on Browserbase's side: start a new one once and try again.
      if (fresh || !/connect|closed|answer/i.test(e.message)) throw e;
      st = { uid, contextId: st.contextId, ...(await createSession(st.contextId)), active: null };
      fresh = true;
      out = await act(st, body);
    }
    out.state.checked = Date.now();
    setCookie(headers, COOKIE, seal(out.state), { maxAge: 60 * 60 * 24 * 365 });
    const views = await liveViews(st.sessionId).catch(() => null);
    const tabs = out.tabs.map((t) => ({ ...t, live: views?.pages.find((p) => p.id === t.id)?.live || null }));
    return json({ ...pageJson(out), tabs, fresh, engine: "browserbase" }, { headers });
  } catch (e) {
    if (!e.status) console.error("[browser]", e);
    return error(e.status || 502, e.message || "The cloud browser failed.", e.code || "browser_error");
  }
};
export const config = { path: "/api/browser" };
