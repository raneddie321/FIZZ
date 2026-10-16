import { error, json, readJson, sameOrigin } from "../lib/util.mjs";
import { requireUser } from "../lib/auth.mjs";
import { clerkConfigured } from "../lib/clerk.mjs";
import { kvConfigured, redis } from "../lib/kv.mjs";

// Cloud copies of FIZZ DEV projects and FIZZ chats, per RanEddie ID user (Upstash Redis).
// Each item is stored in chunks (Upstash requests are limited to about 1 MB) with an index of
// { id, name, updated, size }. Binary files stay in the browser; only text is synced.
const CHUNK = 700_000;
const ITEM_LIMIT = 5 * 1048576;
const USER_LIMIT = 40 * 1048576;
const key = (uid, ...parts) => ["fizz-sync", uid, ...parts].join(":");
const validId = (id) => /^[\w-]{1,80}$/.test(id);

async function index(uid) {
  const [raw] = await redis([["GET", key(uid, "index")]]);
  try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}

export default async (req) => {
  if (!kvConfigured() || !clerkConfigured()) return error(503, "Cloud sync isn't set up on this site (needs RanEddie ID and Upstash Redis).", "not_configured");
  if (!sameOrigin(req)) return error(403, "Not allowed.");
  const who = await requireUser(req);
  if (who.response) return who.response;
  const uid = who.userId;
  const url = new URL(req.url);
  try {
    if (req.method === "GET" && !url.searchParams.get("id")) return json({ items: await index(uid) });
    if (req.method === "GET") {
      const id = url.searchParams.get("id");
      if (!validId(id)) return error(400, "Bad id.");
      const meta = (await index(uid))[id];
      if (!meta) return error(404, "Not found.");
      const parts = await redis(Array.from({ length: meta.chunks }, (_, i) => ["GET", key(uid, "item", id, String(i))]));
      return json({ id, updated: meta.updated, data: JSON.parse(parts.join("")) });
    }
    if (req.method === "PUT") {
      const body = await readJson(req, ITEM_LIMIT + 100_000);
      const id = String(body.id || "");
      if (!validId(id)) return error(400, "Bad id.");
      const text = JSON.stringify(body.data ?? null);
      if (text.length > ITEM_LIMIT) return error(413, "This project is too large to sync (over 5 MB of text).");
      const idx = await index(uid);
      const used = Object.entries(idx).reduce((n, [k, v]) => n + (k === id ? 0 : v.size || 0), 0);
      if (used + text.length > USER_LIMIT) return error(507, "Your cloud storage is full (40 MB). Delete old projects to sync more.");
      const prev = idx[id];
      if (prev && Number(body.updated) < prev.updated) return json({ ok: false, conflict: true, updated: prev.updated });
      const chunks = Math.max(1, Math.ceil(text.length / CHUNK));
      const cmds = [];
      for (let i = 0; i < chunks; i++) cmds.push(["SET", key(uid, "item", id, String(i)), text.slice(i * CHUNK, (i + 1) * CHUNK)]);
      for (let i = chunks; i < (prev?.chunks || 0); i++) cmds.push(["DEL", key(uid, "item", id, String(i))]);
      await redis(cmds);
      idx[id] = { kind: body.kind === "chats" ? "chats" : "project", name: String(body.name || "").slice(0, 80), updated: Number(body.updated) || Date.now(), size: text.length, chunks };
      await redis([["SET", key(uid, "index"), JSON.stringify(idx)]]);
      return json({ ok: true, updated: idx[id].updated });
    }
    if (req.method === "DELETE") {
      const id = url.searchParams.get("id");
      if (!validId(id)) return error(400, "Bad id.");
      const idx = await index(uid);
      const meta = idx[id];
      if (meta) {
        await redis(Array.from({ length: meta.chunks }, (_, i) => ["DEL", key(uid, "item", id, String(i))]));
        delete idx[id];
        await redis([["SET", key(uid, "index"), JSON.stringify(idx)]]);
      }
      return json({ ok: true });
    }
    return error(405, "Method not allowed.");
  } catch (e) {
    console.error("[sync]", e);
    return error(e.status || 502, e.message || "Sync failed.");
  }
};
export const config = { path: "/api/sync" };
