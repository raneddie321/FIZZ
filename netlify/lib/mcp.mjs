// MCP (Model Context Protocol) servers the user adds in Settings → Connections → MCP servers.
// FIZZ's server talks to them for the user: it does the handshake, lists their tools and calls them,
// so Fizz Code can use any MCP server (Streamable HTTP, or the older HTTP+SSE transport) while the
// browser never sees the server's Authorization header. The URL and headers come from the user, so
// every hop is checked against private/internal addresses the same way page reading does.
import { assertPublic } from "./web.mjs";
import { getCookie, seal, setCookie, unseal } from "./util.mjs";
import { kvConfigured, redis } from "./kv.mjs";

const PROTOCOL = "2025-06-18";
const COOKIE = "fizz_mcp";
const MAX_SERVERS = 50;
const MAX_TOOLS = 200;
/** Handshake/listing are quick; a tool call may legitimately take longer (capped below 60s on Vercel). */
export const MCP_MS = { handshake: 25_000, call: 30_000 };

const bad = (message, status = 400, code = "mcp") => Object.assign(new Error(message), { status, code });
const safeJson = (text) => { try { const v = JSON.parse(text); return v && typeof v === "object" ? v : null; } catch { return null; } };

// ---------------- storage ----------------
// Upstash Redis when the site has it (durable, any size); otherwise the list is sealed in an
// HttpOnly cookie like every other credential in FIZZ — page scripts can never read the headers.
const kvKey = (userId) => `fizz:mcp:${userId}`;

export async function loadServers(req, userId) {
  if (kvConfigured()) {
    try {
      const raw = (await redis([["GET", kvKey(userId)]]))[0];
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }
  const list = unseal(getCookie(req, COOKIE))?.list;
  return Array.isArray(list) ? list : [];
}

export async function storeServers(headers, userId, list) {
  if (kvConfigured()) {
    await redis([["SET", kvKey(userId), JSON.stringify(list)]]);
    return;
  }
  const value = seal({ list, exp: Date.now() + 90 * 86400_000 });
  if (value.length > 3400) {
    throw bad("This deployment keeps MCP servers in a secure cookie, which has a size limit. Add Upstash Redis (Vercel → Storage → Upstash Redis) to keep more.", 507, "no_room");
  }
  setCookie(headers, COOKIE, value, { maxAge: 90 * 86400 });
}

/** What the UI and the model get to see: never the headers. */
export const publicServer = (s) => ({
  id: s.id,
  name: s.name,
  url: s.url,
  added: s.added || null,
  tools: Array.isArray(s.tools) ? s.tools : [],
  toolCount: (Array.isArray(s.tools) ? s.tools : []).length,
});

/** Validates what the user typed: a public http(s) URL and optional headers. */
export async function validateServer({ url, headers }) {
  let u;
  try {
    u = new URL(String(url || "").trim());
  } catch {
    throw bad("That isn't a valid URL. Paste the MCP server's full address, e.g. https://example.com/mcp");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw bad("MCP servers must be reached over http:// or https://.");
  await assertPublic(u);
  const out = {};
  for (const [k, v] of Object.entries(headers || {})) {
    const key = String(k).trim();
    const val = String(v ?? "");
    if (!/^[A-Za-z0-9-]{1,40}$/.test(key)) throw bad(`"${key.slice(0, 40)}" isn't a valid header name.`);
    if (/[\r\n]/.test(val)) throw bad("Header values can't contain line breaks.");
    if (val.length > 2000) throw bad(`The ${key} header is too long.`);
    if (["host", "content-length", "content-type", "accept", "connection", "transfer-encoding", "cookie"].includes(key.toLowerCase())) throw bad(`FIZZ sets the ${key} header itself.`);
    if (val.trim()) out[key] = val;
  }
  return { url: u.href, headers: out };
}

const slug = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "server";

// ---------------- the protocol ----------------
const rpc = (id, method, params) => ({ jsonrpc: "2.0", id, method, params: params || {} });
const notify = (method, params) => ({ jsonrpc: "2.0", method, params: params || {} });

/** POST/GET/DELETE to the server, following at most 3 redirects, re-checking every address. */
async function send(url, init, ms) {
  let u = new URL(url);
  for (let hop = 0; hop < 4; hop++) {
    await assertPublic(u);
    let res;
    try {
      res = await fetch(u, { ...init, redirect: "manual", signal: AbortSignal.timeout(ms) });
    } catch (e) {
      const timed = e?.name === "TimeoutError" || e?.name === "AbortError";
      throw bad(timed ? "The MCP server didn't answer in time." : `Couldn't reach the MCP server (${String(e?.message || e).slice(0, 160)}).`, timed ? 504 : 502, "unreachable");
    }
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) {
      res.body?.cancel?.().catch(() => {});
      u = new URL(loc, u);
      continue;
    }
    return res;
  }
  throw bad("The MCP server redirected too many times.", 502, "unreachable");
}

function plainHeaders(server, { session, version, sse = false } = {}) {
  const h = {
    Accept: sse ? "text/event-stream" : "application/json, text/event-stream",
    "User-Agent": "FIZZ-DEV/1.0",
    ...server.headers,
  };
  if (!sse) h["Content-Type"] = "application/json";
  if (session) h["Mcp-Session-Id"] = session;
  if (version) h["MCP-Protocol-Version"] = version;
  return h;
}

/** Reads the first JSON-RPC message of a response — a JSON body, or an SSE stream. */
async function readResponse(res, match) {
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  if (ct.includes("text/event-stream")) {
    const msg = await readSse(res, match);
    if (msg) return msg;
    throw bad("The MCP server closed the connection without answering.", 502, "unreachable");
  }
  const text = await res.text().catch(() => "");
  const msg = text.trim() ? safeJson(text) : null;
  if (msg && (!match || match(msg))) return msg;
  if (!res.ok) {
    throw bad(
      `The MCP server answered ${res.status}${msg?.error?.message ? `: ${String(msg.error.message).slice(0, 240)}` : text ? ` — ${text.replace(/\s+/g, " ").slice(0, 240)}` : "."}`,
      502,
      "server_error",
    );
  }
  return null;
}

/** Walks an SSE body until `match` accepts a JSON-RPC message. The fetch signal bounds it in time. */
async function readSse(res, match) {
  const reader = res.body?.getReader?.();
  if (!reader) throw bad("The MCP server sent an empty response.", 502, "server_error");
  const dec = new TextDecoder();
  let buf = "";
  const drain = () => {
    for (;;) {
      const m = /\r?\n\r?\n/.exec(buf);
      if (!m) return null;
      const frame = buf.slice(0, m.index);
      buf = buf.slice(m.index + m[0].length);
      const data = frame
        .split(/\r?\n/)
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).replace(/^ /, ""))
        .join("\n");
      if (!data || data === "[DONE]") continue;
      const msg = safeJson(data);
      if (msg && (!match || match(msg))) return msg;
    }
  };
  try {
    for (;;) {
      const first = drain();
      if (first) return first;
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
    }
    return drain();
  } catch (e) {
    const timed = e?.name === "TimeoutError" || e?.name === "AbortError";
    throw bad(timed ? "The MCP server didn't answer in time." : "The MCP server stopped responding.", timed ? 504 : 502, "unreachable");
  } finally {
    reader.cancel?.().catch?.(() => {});
  }
}

/** A long-lived SSE connection (the older MCP transport): frames go to whoever is waiting for them. */
function channel(res) {
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "", endpoint = null, ended = false;
  const waiting = [];
  // Replies can arrive a beat before the POST that triggered them is awaited; hold a few so they aren't lost.
  const loose = [];
  const settle = (w, value, err) => {
    const i = waiting.indexOf(w);
    if (i < 0) return;
    waiting.splice(i, 1);
    clearTimeout(w.timer);
    if (err) w.reject(err);
    else w.resolve(value);
  };
  const onFrame = (frame) => {
    let event = "message";
    const data = [];
    for (const line of frame.split(/\r?\n/)) {
      if (line.startsWith(":")) continue;
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
    }
    if (!data.length) return;
    const payload = data.join("\n");
    if (event === "endpoint") {
      endpoint = payload;
      for (const w of [...waiting]) if (w.kind === "endpoint") settle(w, payload);
      return;
    }
    const msg = safeJson(payload);
    if (!msg) return;
    for (const w of [...waiting]) if (w.kind === "msg" && w.match(msg)) { settle(w, msg); return; }
    if (msg.id !== undefined) {
      loose.push(msg);
      if (loose.length > 16) loose.shift();
    }
  };
  const drain = () => {
    for (;;) {
      const m = /\r?\n\r?\n/.exec(buf);
      if (!m) break;
      const frame = buf.slice(0, m.index);
      buf = buf.slice(m.index + m[0].length);
      if (frame.trim()) onFrame(frame);
    }
  };
  (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        drain();
      }
    } catch {
      /* the stream was closed or aborted */
    }
    ended = true;
    for (const w of [...waiting]) settle(w, null, bad("The MCP server closed the connection.", 502, "unreachable"));
  })();
  return {
    wait(match, ms) {
      const hit = loose.findIndex((m) => match(m));
      if (hit >= 0) return Promise.resolve(loose.splice(hit, 1)[0]);
      return new Promise((resolve, reject) => {
        if (ended) return reject(bad("The MCP server closed the connection.", 502, "unreachable"));
        const w = { kind: "msg", match, resolve, reject, timer: 0 };
        w.timer = setTimeout(() => settle(w, null, bad("The MCP server didn't answer in time.", 504, "timeout")), ms);
        waiting.push(w);
      });
    },
    waitEndpoint(ms) {
      if (endpoint) return Promise.resolve(endpoint);
      return new Promise((resolve, reject) => {
        if (ended) return reject(bad("The MCP server's stream ended before it started a session.", 502, "unreachable"));
        const w = { kind: "endpoint", resolve, reject, timer: 0 };
        w.timer = setTimeout(() => settle(w, null, bad("That server uses the older MCP SSE transport but never started a session.", 502, "server_error")), ms);
        waiting.push(w);
      });
    },
    close() {
      try {
        reader.cancel().catch(() => {});
      } catch {}
    },
  };
}

/** Statuses that mean "this endpoint doesn't do POST-based MCP" → try the older SSE transport. */
const legacyStatus = (s) => [400, 404, 405, 406, 415, 501].includes(s);

const INIT = () => ({
  protocolVersion: PROTOCOL,
  capabilities: {},
  clientInfo: { name: "FIZZ DEV", version: "1.0.0", title: "FIZZ" },
});

/** Opens a session: Streamable HTTP first, the older GET-SSE transport as a fallback. */
async function openSession(server, ms) {
  const init = rpc(0, "initialize", INIT());
  let res;
  try {
    res = await send(server.url, { method: "POST", headers: plainHeaders(server), body: JSON.stringify(init) }, ms);
  } catch (e) {
    // A network-level failure (not a timeout, not an SSRF block) may mean the server only speaks
    // the older GET-SSE transport; a 400 from assertPublic is a real rejection and must not be retried.
    if (e.code === "unreachable" && e.status !== 504) return legacySession(server, ms);
    throw e;
  }
  if (legacyStatus(res.status)) {
    res.body?.cancel?.().catch(() => {});
    return legacySession(server, ms);
  }
  const session = res.headers.get("mcp-session-id");
  let msg = null;
  try {
    msg = await readResponse(res, (m) => m.id === 0);
  } catch (e) {
    // The stream broke mid-answer (not a timeout); the older GET-SSE transport may still work.
    if (e.code !== "unreachable" || e.status === 504) throw e;
    return legacySession(server, ms);
  }
  if (!msg) return legacySession(server, ms);
  if (msg.error) throw bad(`The MCP server refused the connection: ${String(msg.error.message || "initialize failed").slice(0, 240)}`, 502, "server_error");
  const version = typeof msg.result?.protocolVersion === "string" ? msg.result.protocolVersion : PROTOCOL;
  const info = msg.result?.serverInfo || null;

  // Tell the server the handshake is done (202, no response to wait for).
  const note = await send(server.url, { method: "POST", headers: plainHeaders(server, { session, version }), body: JSON.stringify(notify("notifications/initialized")) }, 10_000).catch(() => null);
  note?.body?.cancel?.().catch(() => {});

  let nextId = 1;
  return {
    info,
    async request(method, params, reqMs) {
      const id = nextId++;
      const r = await send(server.url, { method: "POST", headers: plainHeaders(server, { session, version }), body: JSON.stringify(rpc(id, method, params)) }, reqMs || ms);
      const msg2 = await readResponse(r, (m) => m.id === id);
      if (!msg2) throw bad(`The MCP server didn't answer ${method}.`, 502, "server_error");
      if (msg2.error) {
        const e = bad(`${method} failed: ${String(msg2.error.message || "error").slice(0, 240)}`, 400, "tool_error");
        e.detail = msg2.error;
        throw e;
      }
      return msg2.result || {};
    },
    close() {
      if (!session) return;
      send(server.url, { method: "DELETE", headers: plainHeaders(server, { session, version }) }, 5_000)
        .then((r) => r.body?.cancel?.().catch(() => {}))
        .catch(() => {});
    },
  };
}

/** The older transport: a GET opens an SSE stream, the server posts its endpoint, replies arrive on it. */
async function legacySession(server, ms) {
  let res;
  try {
    res = await send(server.url, { method: "GET", headers: plainHeaders(server, { sse: true }) }, ms);
  } catch (e) {
    throw bad(`Couldn't open that MCP server (${e.message}).`, e.status || 502, e.code || "unreachable");
  }
  const ct = (res.headers.get("content-type") || "").toLowerCase();
  if (!res.ok || !ct.includes("text/event-stream")) {
    const body = await res.text().catch(() => "");
    res.body?.cancel?.().catch(() => {});
    throw bad(
      `That URL doesn't look like an MCP server — it answered ${res.status}${ct ? ` as ${ct.split(";")[0]}` : ""}${body ? `: ${body.replace(/\s+/g, " ").slice(0, 160)}` : ""}. Try the server's /mcp or /sse endpoint.`,
      502,
      "server_error",
    );
  }
  const ch = channel(res);
  const postHeaders = plainHeaders(server);
  try {
    const ep = await ch.waitEndpoint(ms);
    const postUrl = new URL(ep, server.url).href;
    let nextId = 1;
    const post = async (payload, waitId, waitMs) => {
      const budget = waitMs || ms;
      const r = await send(postUrl, { method: "POST", headers: postHeaders, body: JSON.stringify(payload) }, budget);
      let msg = null;
      if ((r.headers.get("content-type") || "").toLowerCase().includes("text/event-stream")) {
        r.body?.cancel?.().catch(() => {});
      } else {
        const text = await r.text().catch(() => "");
        msg = text.trim() ? safeJson(text) : null;
      }
      if (msg) return msg;
      if (waitId === null || waitId === undefined) return null;
      return ch.wait((m) => m.id === waitId, budget);
    };
    const init = await post(rpc(0, "initialize", INIT()), 0);
    if (!init) throw bad("That server didn't finish the MCP handshake.", 502, "server_error");
    if (init.error) throw bad(`The MCP server refused the connection: ${String(init.error.message || "initialize failed").slice(0, 240)}`, 502, "server_error");
    await post(notify("notifications/initialized"), null);
    return {
      info: init.result?.serverInfo || null,
      async request(method, params, reqMs) {
        const id = nextId++;
        const m = await post(rpc(id, method, params), id, reqMs);
        if (!m) throw bad(`The MCP server didn't answer ${method}.`, 502, "server_error");
        if (m.error) {
          const e = bad(`${method} failed: ${String(m.error.message || "error").slice(0, 240)}`, 400, "tool_error");
          e.detail = m.error;
          throw e;
        }
        return m.result || {};
      },
      close() {
        ch.close();
      },
    };
  } catch (e) {
    ch.close();
    throw e;
  }
}

// ---------------- tools ----------------
const typeOf = (v) => (Array.isArray(v?.type) ? v.type.join("|") : v?.type || (v?.enum ? "enum" : "any"));

/** A short human hint of a tool's arguments, so the model knows what to send. */
function schemaHint(schema) {
  if (!schema || typeof schema !== "object") return "";
  const required = new Set(Array.isArray(schema.required) ? schema.required : []);
  const props = Object.entries(schema.properties || {})
    .slice(0, 24)
    .map(([k, v]) => `${k}: ${typeOf(v)}${required.has(k) ? " (required)" : ""}`);
  const desc = String(schema.description || "").replace(/\s+/g, " ").trim().slice(0, 240);
  return [desc, props.length ? `Arguments: ${props.join(", ")}` : ""].filter(Boolean).join(" ");
}

const cleanTool = (t) => {
  const name = String(t?.name || "").trim();
  if (!name || name.length > 120) return null;
  return {
    name,
    description: String(t.description || "").replace(/\s+/g, " ").trim().slice(0, 400),
    input: schemaHint(t.inputSchema).slice(0, 500),
  };
};

/** Handshake + every page of tools/list. Returns the server's name and its tools. */
export async function listTools(server) {
  const s = await openSession(server, MCP_MS.handshake);
  try {
    const tools = [];
    let cursor;
    for (let page = 0; page < 5; page++) {
      const r = await s.request("tools/list", cursor ? { cursor } : {}, MCP_MS.handshake);
      for (const t of Array.isArray(r.tools) ? r.tools : []) {
        const c = cleanTool(t);
        if (c) tools.push(c);
      }
      cursor = typeof r.nextCursor === "string" && r.nextCursor ? r.nextCursor : null;
      if (!cursor) break;
    }
    return { name: String(s.info?.name || "").slice(0, 60), tools: tools.slice(0, MAX_TOOLS) };
  } finally {
    s.close();
  }
}

/** Text (and small images) out of a tools/call result, ready to hand back to the model. */
function renderResult(r) {
  const parts = [];
  const images = [];
  for (const item of Array.isArray(r?.content) ? r.content : []) {
    if (item?.type === "text") parts.push(String(item.text ?? ""));
    else if (item?.type === "image" && images.length < 3 && typeof item.data === "string") {
      const mime = /^[\w.+-]+\/[\w.+-]+$/.test(String(item.mimeType || "")) ? item.mimeType : "image/png";
      if (item.data.length < 900_000) images.push(`data:${mime};base64,${item.data}`);
    } else if (item?.type === "resource" && item.resource) {
      if (typeof item.resource.text === "string") parts.push(item.resource.text);
      else if (item.resource.uri) parts.push(`[resource ${item.resource.uri}]`);
    } else if (item?.type === "resourceLink") parts.push(`${item.name || "resource"} — ${item.uri || ""}`.trim());
    else parts.push(JSON.stringify(item).slice(0, 2000));
  }
  if (!parts.length && r?.structuredContent !== undefined && r?.structuredContent !== null) {
    parts.push(typeof r.structuredContent === "string" ? r.structuredContent : JSON.stringify(r.structuredContent, null, 1));
  }
  let text = parts.filter((p) => p !== "").join("\n").trim();
  if (!text) text = r?.isError ? "The tool reported an error with no message." : "The tool returned nothing.";
  const long = text.length > 60_000;
  if (long) text = text.slice(0, 60_000) + "\n…(cut)";
  return { ok: !r?.isError, text, images, truncated: long };
}

/** Calls one tool on a server: handshake, tools/call, close. */
export async function callTool(server, name, args) {
  const s = await openSession(server, MCP_MS.call);
  try {
    const r = await s.request("tools/call", { name, arguments: args && typeof args === "object" ? args : {} }, MCP_MS.call);
    return renderResult(r);
  } finally {
    s.close();
  }
}

/** Removes a stored header's value from anything that could leak it back to the browser. */
export const redact = (text, server) => {
  let out = String(text);
  for (const v of Object.values(server?.headers || {})) if (v && v.length > 4) out = out.split(v).join("••••");
  return out;
};

export const MCP_LIMITS = { add: 30, remove: 120, list: 600, tools: 60, call: 400 };
export const MCP_COOKIE = COOKIE;
export const MAX_MCP_SERVERS = MAX_SERVERS;
export { slug };
