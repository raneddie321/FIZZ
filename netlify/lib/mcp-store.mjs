// Where FIZZ keeps each user's MCP servers (custom connectors), with no size limit:
//   • Neon Postgres when the site has a database (DATABASE_URL / POSTGRES_URL): one row per server,
//     the same on every device the user signs in on.
//   • Upstash Redis when connected (KV_REST_API_URL/TOKEN).
//   • Otherwise an encrypted "vault" the browser keeps in localStorage and sends with each request.
// In every case the secret part (headers, OAuth tokens) is sealed with FIZZ_SECRET (AES-256-GCM), so a
// database dump or the browser's storage never holds a readable token, and it is bound to one user id.
// The tool list is cache (it can always be listed again) and is stored next to it, not inside cookies.
import { clearCookie, env, getCookie, seal, setCookie, unseal } from "./util.mjs";
import { kvConfigured, redis } from "./kv.mjs";

const OLD = "fizz_mcp";           // the old cookie list (fizz_mcp, fizz_mcp_1…_3): read once, then moved
const PENDING_NEW = "fizz_mcp_new"; // a server just signed in with OAuth, waiting to go into the vault
const CHUNK = 3500, CHUNKS = 4;

export const neonUrl = () => env("DATABASE_URL") || env("POSTGRES_URL") || env("NEON_DATABASE_URL") || "";
/** "neon" | "redis" | "vault" */
export const storageKind = () => (neonUrl() ? "neon" : kvConfigured() ? "redis" : "vault");

// ---------- Neon ----------
let makeSql = null;
/** Tests pass a fake `neon()`. */
export function setSqlFactory(f) { makeSql = f; ready = null; }
let ready = null;
async function db() {
  if (!makeSql) makeSql = (await import("@neondatabase/serverless")).neon;
  const sql = makeSql(neonUrl());
  ready ||= sql.query(
    "CREATE TABLE IF NOT EXISTS fizz_mcp_servers (user_id text NOT NULL, id text NOT NULL, sealed text NOT NULL, tools text NOT NULL DEFAULT '[]', pos double precision NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (user_id, id))",
  ).catch((e) => { ready = null; throw e; });
  await ready;
  return sql;
}

// ---------- cookies that span a few chunks ----------
function readChunks(req, name) {
  let raw = getCookie(req, name) || "";
  for (let i = 1; i < CHUNKS && raw; i++) { const p = getCookie(req, `${name}_${i}`); if (!p) break; raw += p; }
  return raw;
}
function writeChunks(headers, name, value) {
  if (value.length > CHUNK * CHUNKS) throw Object.assign(new Error("This sign-in is too large to hand over. Try again."), { status: 507 });
  for (let i = 0; i < CHUNKS; i++) {
    const part = value.slice(i * CHUNK, (i + 1) * CHUNK);
    const n = i ? `${name}_${i}` : name;
    if (part) setCookie(headers, n, part, { maxAge: 15 * 60 });
    else clearCookie(headers, n);
  }
}
function clearChunks(req, headers, name) {
  for (let i = 0; i < CHUNKS; i++) { const n = i ? `${name}_${i}` : name; if (getCookie(req, n) !== null) clearCookie(headers, n); }
}

const valid = (s) => s && typeof s === "object" && typeof s.id === "string" && typeof s.url === "string";
const secretPart = ({ tools, ...rest }) => rest;
const fingerprint = (s) => JSON.stringify(s);

/** Merges servers found elsewhere (old cookies, a fresh OAuth sign-in) into the list, by URL. */
function merge(list, extra) {
  let changed = false;
  for (const s of extra) {
    if (!valid(s)) continue;
    const i = list.findIndex((x) => x.url === s.url);
    if (i >= 0) { list[i] = { ...s, id: list[i].id, tools: s.tools?.length ? s.tools : list[i].tools }; changed = true; }
    else {
      let id = s.id;
      for (let n = 2; list.some((x) => x.id === id); n++) id = `${s.id}-${n}`;
      list.push({ ...s, id });
      changed = true;
    }
  }
  return changed;
}

/**
 * Opens the user's connector list. `body.vault` is the browser's vault (vault mode only).
 * Returns { list, kind, save(list), out() } — `out()` is what to add to the JSON reply (the new vault).
 */
export async function openStore(req, userId, body = {}, headers = new Headers()) {
  const kind = storageKind();
  let list = [];
  let legacyRedis = false;
  const loaded = new Map();
  if (kind === "neon") {
    const sql = await db();
    const rows = await sql.query("SELECT id, sealed, tools FROM fizz_mcp_servers WHERE user_id = $1 ORDER BY pos, updated_at", [userId]);
    for (const r of rows) {
      const s = unseal(r.sealed);
      if (!valid(s) || s.uid !== userId) continue;
      const { uid, ...server } = s;
      let tools = [];
      try { tools = JSON.parse(r.tools || "[]"); } catch {}
      const full = { ...server, tools: Array.isArray(tools) ? tools : [] };
      list.push(full);
      loaded.set(full.id, fingerprint(full));
    }
  } else if (kind === "redis") {
    const [sealed, legacy] = await redis([["GET", `fizz:mcp2:${userId}`], ["GET", `fizz:mcp:${userId}`]]);
    const v = unseal(sealed);
    if (v?.uid === userId && Array.isArray(v.list)) list = v.list.filter(valid);
    // The old Redis key held the list as plain JSON: move it into the sealed key.
    else if (legacy) { try { const l = JSON.parse(legacy); if (Array.isArray(l)) { list = l.filter(valid); legacyRedis = true; } } catch {} }
  } else {
    const v = unseal(typeof body.vault === "string" ? body.vault : "");
    if (v?.uid === userId && Array.isArray(v.list)) list = v.list.filter(valid);
  }

  // Move what older versions kept in cookies, and a server just signed in with OAuth (vault mode).
  let dirty = legacyRedis;
  const old = unseal(readChunks(req, OLD));
  if (old) { if (Array.isArray(old.list)) dirty = merge(list, old.list) || dirty; clearChunks(req, headers, OLD); }
  const fresh = unseal(readChunks(req, PENDING_NEW));
  if (fresh) { if (fresh.uid === userId && valid(fresh.server)) dirty = merge(list, [fresh.server]) || dirty; clearChunks(req, headers, PENDING_NEW); }

  let vault = null;
  const store = {
    kind,
    get list() { return list; },
    async save(next) {
      list = next.filter(valid);
      if (kind === "neon") {
        const sql = await db();
        const keep = new Set(list.map((s) => s.id));
        const gone = [...loaded.keys()].filter((id) => !keep.has(id));
        const writes = [];
        list.forEach((s, pos) => {
          if (loaded.get(s.id) === fingerprint(s)) return;
          writes.push(sql.query(
            "INSERT INTO fizz_mcp_servers (user_id, id, sealed, tools, pos, updated_at) VALUES ($1, $2, $3, $4, $5, now()) ON CONFLICT (user_id, id) DO UPDATE SET sealed = EXCLUDED.sealed, tools = EXCLUDED.tools, pos = EXCLUDED.pos, updated_at = now()",
            [userId, s.id, seal({ ...secretPart(s), uid: userId }), JSON.stringify(s.tools || []), pos],
          ));
        });
        if (gone.length) writes.push(sql.query("DELETE FROM fizz_mcp_servers WHERE user_id = $1 AND id = ANY($2)", [userId, gone]));
        await Promise.all(writes);
        loaded.clear();
        for (const s of list) loaded.set(s.id, fingerprint(s));
      } else if (kind === "redis") {
        await redis([["SET", `fizz:mcp2:${userId}`, seal({ uid: userId, list })], ["DEL", `fizz:mcp:${userId}`]]);
      } else {
        vault = seal({ uid: userId, list, v: 2 });
      }
    },
    /** Add to the JSON reply: the browser keeps the new vault (vault mode). */
    out() { return vault ? { vault } : {}; },
  };
  if (dirty) await store.save(list);
  return store;
}

/** After an OAuth sign-in (a plain redirect, so no vault is sent): keep the new server for the next request. */
export async function handOver(req, userId, server, headers) {
  if (storageKind() !== "vault") {
    const store = await openStore(req, userId, {}, headers);
    const list = [...store.list];
    merge(list, [server]);
    await store.save(list);
    return;
  }
  const { tools, ...slim } = server; // tools are listed again on the next request
  writeChunks(headers, PENDING_NEW, seal({ uid: userId, server: { ...slim, tools: [] }, exp: Date.now() + 15 * 60_000 }));
}
