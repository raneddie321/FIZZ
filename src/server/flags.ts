import "server-only";
import { db } from "./db";

let cache: { at: number; flags: Map<string, boolean> } | null = null;
const TTL = 15_000;

export async function flagEnabled(key: string, fallback = false): Promise<boolean> {
  if (!cache || Date.now() - cache.at > TTL) {
    const rows = await db.featureFlag.findMany().catch(() => []);
    cache = { at: Date.now(), flags: new Map(rows.map((r) => [r.key, r.enabled])) };
  }
  return cache.flags.get(key) ?? fallback;
}

export function invalidateFlags() {
  cache = null;
}
