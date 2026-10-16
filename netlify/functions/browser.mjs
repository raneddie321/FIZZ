import { env, error, getCookie, json, readJson, sameOrigin, seal, setCookie, unseal } from "../lib/util.mjs";
import { requireUser } from "../lib/auth.mjs";
import { kvConfigured, quotaCounter, redis, today } from "../lib/kv.mjs";
import { act, browserConfigured, createContext, createSession, liveViews, releaseSession, sessionRunning } from "../lib/browser.mjs";

// The cloud browser for Fizz Code and the FIZZ DEV Browser tab (Browserbase).
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
  if (!browserConfigured()) return error(503, "The cloud browser isn't set up on this site (BROWSERBASE_API_KEY in Vercel).", "not_configured");
  if (req.method !== "POST") return error(405, "Use POST.");
  if (!sameOrigin(req)) return error(403, "Not allowed.");
  const who = await requireUser(req);
  if (who.response) return who.response;
  const uid = who.userId;
  const headers = new Headers();
  try {
    const body = await readJson(req, 20_000);
    const action = String(body.action || "");
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
    return json({ text: out.text, page: { url: out.page.url, title: out.page.title, captcha: out.page.captcha }, elements: out.page.elements.map((e) => ({ id: e.id, label: e.label, tag: e.tag, type: e.type })), tabs, screenshot: out.screenshot, fresh }, { headers });
  } catch (e) {
    if (!e.status) console.error("[browser]", e);
    return error(e.status || 502, e.message || "The cloud browser failed.", e.code || "browser_error");
  }
};
export const config = { path: "/api/browser" };
