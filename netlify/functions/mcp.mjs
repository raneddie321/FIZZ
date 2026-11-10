import { clearCookie, error, env, getCookie, json, readJson, sameOrigin, seal, secretConfigured, setCookie, unseal } from "../lib/util.mjs";
import { authorizeUrl, discover, ensureFresh, exchange, register } from "../lib/mcp-oauth.mjs";
import { requireUser } from "../lib/auth.mjs";
import { quotaCounter, today } from "../lib/kv.mjs";
import { callTool, listTools, MAX_MCP_SERVERS, MCP_LIMITS, publicServer, redact, slug, validateServer } from "../lib/mcp.mjs";
import { handOver, openStore } from "../lib/mcp-store.mjs";

/** Connect, list, refresh and call the MCP (Model Context Protocol) servers the user added. */
const PENDING = "fizz_mcp_oauth";
const callbackUrl = (req) => `${new URL(req.url).origin}/api/mcp/oauth-callback`;
const RETURN = new Set(["/dev.html", "/chat.html", "/dev", "/chat"]);

/** Where the MCP server's sign-in page sends the user back: finish the sign-in, save the connector, go home. */
async function oauthCallback(req) {
  const url = new URL(req.url);
  const pending = unseal(getCookie(req, PENDING));
  const headers = new Headers();
  clearCookie(headers, PENDING);
  const back = (params) => {
    const to = new URL(pending?.returnTo && RETURN.has(pending.returnTo) ? pending.returnTo : "/dev.html", url.origin);
    for (const [k, v] of Object.entries(params)) to.searchParams.set(k, v);
    headers.set("Location", to.href);
    return new Response(null, { status: 302, headers });
  };
  if (!pending || pending.exp < Date.now() || pending.state !== url.searchParams.get("state")) return back({ mcp_error: "The sign-in took too long or came from somewhere else. Try connecting again." });
  if (url.searchParams.get("error")) return back({ mcp_error: `${pending.name}: ${url.searchParams.get("error_description") || url.searchParams.get("error")}`.slice(0, 200) });
  try {
    const o = { ...pending.client, tokenEndpoint: pending.tokenEndpoint, resource: pending.resource };
    const t = await exchange(o, url.searchParams.get("code") || "", pending.verifier, callbackUrl(req));
    const cfg = { url: pending.url, headers: { ...pending.headers, Authorization: `${t.type} ${t.access}` } };
    const found = await listTools(cfg);
    const name = pending.name || found.name || humanHost(cfg.url);
    const server = { id: slug(name), name, url: cfg.url, headers: cfg.headers, tools: found.tools, added: Date.now(), oauth: { ...o, refresh: t.refresh, exp: t.exp } };
    // Saved straight to Neon/Redis; in vault mode it waits in a short-lived sealed cookie until the page asks.
    await handOver(req, pending.userId, server, headers);
    return back({ mcp_connected: name });
  } catch (e) {
    if (!e.status) console.error("[mcp oauth]", e);
    return back({ mcp_error: `${pending.name}: ${String(e.message || "sign-in failed").slice(0, 180)}` });
  }
}

/** Runs fn with a fresh token, refreshing once more if the server says the token was rejected. */
async function withFreshAuth(s, store, fn) {
  let current = s;
  const save = async (next) => { current = next; await store.save(store.list.map((x) => (x.id === next.id ? next : x))); };
  const fresh = await ensureFresh(current).catch(() => ({ server: current, changed: false }));
  if (fresh.changed) await save(fresh.server);
  try {
    return { value: await fn(current), server: current };
  } catch (e) {
    if (e.code !== "auth_required" || !current.oauth?.refresh) throw e;
    const again = await ensureFresh({ ...current, oauth: { ...current.oauth, exp: 1 } });
    await save(again.server);
    return { value: await fn(current), server: current };
  }
}

export default async (req, context) => {
  const action = context.params.action;
  if (action === "oauth-callback") {
    if (!secretConfigured()) return error(503, "FIZZ_SECRET isn't set on this server.", "not_configured");
    return oauthCallback(req);
  }
  if (!sameOrigin(req)) return error(403, "Not allowed.");
  if (!secretConfigured()) return error(503, "FIZZ_SECRET isn't set on this server.", "not_configured");
  if (!(action in MCP_LIMITS)) return error(404, "Unknown action.");
  const who = await requireUser(req);
  if (who.response) return who.response;
  // Web search and reading are quota'd the same way; a runaway agent can't spend all day on MCP calls.
  const limit = action === "call" ? Number(env("FIZZ_MCP_LIMIT") || MCP_LIMITS.call) : MCP_LIMITS[action];
  const bump = quotaCounter();
  if (!(await bump(`${today()}/mcp-${action}/${who.userId}`, limit))) {
    return error(429, `You've reached today's limit for MCP ${action === "call" ? "tool calls" : action === "add" ? "connections" : "requests"}. Try again tomorrow.`, "quota");
  }
  const headers = new Headers();
  // The header values (e.g. Authorization) must never come back to the browser, even inside an error.
  let active = null;
  let fail = error;
  try {
    // The body carries the browser's vault when the site has no database, so it may be large.
    const body = req.method === "POST" ? await readJson(req, 4_000_000) : {};
    const store = await openStore(req, who.userId, body, headers);
    const reply = (data) => json({ ...data, ...store.out(), storage: store.kind }, { headers });
    // Errors keep the vault too: a refreshed sign-in must not be lost because the call itself failed.
    fail = (status, message, code = "error") => json({ error: { code, message }, ...store.out() }, { status, headers });

    if (action === "list") {
      // A server signed in on another page (OAuth) arrives without its tools: list them now.
      const missing = store.list.filter((s) => !s.tools?.length);
      if (missing.length) {
        const fixed = await Promise.all(missing.map((s) => withFreshAuth(s, store, (cur) => listTools(cur)).then(({ value, server }) => ({ ...server, tools: value.tools }), () => null)));
        const byId = new Map(fixed.filter(Boolean).map((s) => [s.id, s]));
        if (byId.size) await store.save(store.list.map((s) => byId.get(s.id) || s));
      }
      return reply({ servers: store.list.map(publicServer) });
    }

    if (action === "add") {
      const cfg = await validateServer(body);
      active = cfg;
      // The handshake doubles as the check: a wrong URL or dead server fails here, before saving.
      const found = await listTools(cfg);
      const servers = store.list;
      const existing = servers.find((s) => s.url === cfg.url);
      if (!existing && servers.length >= MAX_MCP_SERVERS) {
        return fail(413, `You can connect up to ${MAX_MCP_SERVERS} MCP servers at a time. Remove one first.`, "too_many");
      }
      // A name the user typed wins; otherwise the server's own name, then the host.
      const name = String(body.name || "").trim().slice(0, 40) || found.name || existing?.name || humanHost(cfg.url);
      const server = {
        id: existing?.id || uniqueId(servers, slug(name)),
        name,
        url: cfg.url,
        headers: cfg.headers,
        tools: found.tools,
        added: existing?.added || Date.now(),
      };
      const list = existing ? servers.map((s) => (s.id === existing.id ? server : s)) : [...servers, server];
      await store.save(list);
      return reply({ ok: true, server: publicServer(server) });
    }

    // Step 2 of "Add custom connector": how does this server want to be signed in to?
    if (action === "discover") {
      const cfg = await validateServer({ url: body.url });
      const d = await discover(cfg.url);
      return json({ auth: d.auth, dcr: Boolean(d.dcr), cimd: Boolean(d.cimd), scopes: d.scopes || [], status: d.status || null });
    }

    // Sign in now: register FIZZ with the server (or use the user's client), then send the user to sign in.
    if (action === "oauth-start") {
      const cfg = await validateServer({ url: body.url, headers: body.headers });
      active = cfg;
      const meta = await discover(cfg.url);
      if (meta.auth !== "oauth") return fail(400, meta.auth === "none" ? "This server works without signing in — choose “No sign-in”." : "This server didn't ask for a sign-in.", "no_oauth");
      const ownId = String(body.clientId || "").trim();
      const client = ownId
        ? { clientId: ownId.slice(0, 300), clientSecret: String(body.clientSecret || "").slice(0, 500), authMethod: body.clientSecret ? "client_secret_post" : "none" }
        : await register(meta, callbackUrl(req));
      const a = authorizeUrl(meta, client, callbackUrl(req), String(body.scope || "").trim().slice(0, 500));
      const returnTo = RETURN.has(String(body.returnTo || "")) ? String(body.returnTo) : "/dev.html";
      setCookie(headers, PENDING, seal({ userId: who.userId, url: cfg.url, name: String(body.name || "").trim().slice(0, 40), headers: cfg.headers, client, tokenEndpoint: meta.tokenEndpoint, resource: meta.resource, verifier: a.verifier, state: a.state, returnTo, exp: Date.now() + 15 * 60_000 }), { maxAge: 15 * 60 });
      return json({ authorizeUrl: a.url }, { headers });
    }

    const servers = store.list;
    const pick = (id) => servers.find((s) => s.id === String(id || ""));

    if (action === "remove") {
      const s = pick(body.id);
      if (!s) return fail(404, "That MCP server isn't connected.", "not_found");
      await store.save(servers.filter((x) => x.id !== s.id));
      return reply({ ok: true });
    }

    if (action === "tools") {
      const s = pick(body.id);
      if (!s) return fail(404, "That MCP server isn't connected.", "not_found");
      const { value: found, server: latest } = await withFreshAuth(s, store, (cur) => listTools(cur));
      const updated = { ...latest, tools: found.tools };
      await store.save(store.list.map((x) => (x.id === s.id ? updated : x)));
      return reply({ ok: true, server: publicServer(updated) });
    }

    if (action === "call") {
      const s = pick(body.id);
      if (!s) return fail(404, "That MCP server isn't connected.", "not_found");
      const name = String(body.tool || "").trim();
      if (!name || name.length > 120) return fail(400, "Which tool should FIZZ call?", "bad_tool");
      let args = body.arguments;
      if (args !== undefined && args !== null && typeof args !== "object") return fail(400, "The arguments must be JSON.", "bad_arguments");
      try {
        const { value: out } = await withFreshAuth(s, store, (cur) => callTool(cur, name, args || {}));
        return reply({ ok: out.ok, isError: !out.ok, text: redact(out.text, s), images: out.images || [], truncated: Boolean(out.truncated) });
      } catch (e) {
        const message = redact(e.message || String(e), s);
        if (!e.status) console.error("[mcp]", e);
        return fail(e.status || 502, message, e.code || "error");
      }
    }
    return fail(404, "Unknown action.");
  } catch (e) {
    if (!e.status) console.error("[mcp]", e);
    return fail(e.status || 502, redact(e.message || "The MCP server didn't answer.", active));
  }
};

const humanHost = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "MCP server";
  }
};

const uniqueId = (servers, base) => {
  let id = base;
  for (let i = 2; servers.some((s) => s.id === id); i++) id = `${base}-${i}`;
  return id;
};

export const config = { path: "/api/mcp/:action" };
