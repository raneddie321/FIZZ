// Small key-value store for FIZZ's server features (daily limits, cloud sync).
// Upstash Redis when connected (Vercel → Storage → Upstash sets KV_REST_API_URL/TOKEN), otherwise an
// in-memory map that only lives as long as one server instance.
import { env } from "./util.mjs";

const memory = new Map();
export const kvConfigured = () => Boolean((env("KV_REST_API_URL") || env("UPSTASH_REDIS_REST_URL")) && (env("KV_REST_API_TOKEN") || env("UPSTASH_REDIS_REST_TOKEN")));

/** Runs Redis commands in one round trip: [["GET","k"],["SET","k","v"]] → results. */
export async function redis(commands) {
  const url = env("KV_REST_API_URL") || env("UPSTASH_REDIS_REST_URL");
  const token = env("KV_REST_API_TOKEN") || env("UPSTASH_REDIS_REST_TOKEN");
  if (!url || !token) return commands.map((c) => memoryCommand(c));
  const res = await fetch(`${url.replace(/\/$/, "")}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(commands),
  });
  if (!res.ok) throw Object.assign(new Error(`Storage error ${res.status}`), { status: 502 });
  const out = await res.json();
  return out.map((r) => {
    if (r.error) throw Object.assign(new Error(r.error), { status: 502 });
    return r.result;
  });
}
function memoryCommand([cmd, key, ...args]) {
  if (memory.size > 50_000) memory.clear();
  switch (cmd) {
    case "GET": return memory.get(key) ?? null;
    case "SET": memory.set(key, String(args[0])); return "OK";
    case "DEL": memory.delete(key); return 1;
    case "INCR": { const n = Number(memory.get(key) || 0) + 1; memory.set(key, String(n)); return n; }
    case "EXPIRE": return 1;
    default: throw new Error(`Unsupported command ${cmd}`);
  }
}

/** A daily counter: returns false once `limit` is reached for this key today (UTC). */
export function quotaCounter() {
  return async (key, limit) => {
    const k = `fizz-quota:${key}`;
    const [n] = await redis([["INCR", k], ["EXPIRE", k, "172800"]]);
    return Number(n) <= limit;
  };
}
export const today = () => new Date().toISOString().slice(0, 10);
