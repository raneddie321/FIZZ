import "server-only";
import { tooManyRequests } from "./http";

/**
 * Fixed-window in-memory rate limiter. Suitable for a single instance; for a
 * multi-instance deployment swap the store for Redis (same interface).
 */
type Bucket = { count: number; resetAt: number };

const globalStore = globalThis as unknown as { __fizzRateLimit?: Map<string, Bucket> };
const store = (globalStore.__fizzRateLimit ??= new Map<string, Bucket>());

export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; remaining: number; retryAfter: number } {
  const now = Date.now();
  let bucket = store.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    store.set(key, bucket);
  }
  bucket.count += 1;
  if (store.size > 50_000) {
    for (const [k, b] of store) if (b.resetAt <= now) store.delete(k);
  }
  const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  return { ok: bucket.count <= limit, remaining: Math.max(0, limit - bucket.count), retryAfter };
}

export function enforceRateLimit(key: string, limit: number, windowMs: number, message?: string) {
  const result = rateLimit(key, limit, windowMs);
  if (!result.ok) throw tooManyRequests(message, result.retryAfter);
}

export const LIMITS = {
  auth: { limit: 10, windowMs: 15 * 60_000 },
  authEmail: { limit: 5, windowMs: 60 * 60_000 },
  chat: { limit: 30, windowMs: 60_000 },
  upload: { limit: 30, windowMs: 60_000 },
  agent: { limit: 10, windowMs: 60_000 },
  terminal: { limit: 60, windowMs: 60_000 },
  api: { limit: 300, windowMs: 60_000 },
  contact: { limit: 5, windowMs: 60 * 60_000 },
} as const;
