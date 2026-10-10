import "server-only";
import { db } from "../db";
import { normalizeLimits, type PlanLimits } from "@/lib/plans";

export async function ensureFreeSubscription(userId: string) {
  const existing = await db.subscription.findUnique({ where: { userId } });
  if (existing) return existing;
  const free = await db.plan.findUnique({ where: { key: "free" } });
  if (!free) return null;
  return db.subscription.create({ data: { userId, planId: free.id, status: "ACTIVE", provider: "none" } });
}

export type EffectivePlan = { key: string; name: string; limits: PlanLimits; status: string; provider: string };

/** The plan whose limits currently apply to the user (falls back to Free when a paid plan lapses). */
export async function getEffectivePlan(userId: string): Promise<EffectivePlan> {
  const sub = await db.subscription.findUnique({ where: { userId }, include: { plan: true } });
  const usable = sub && ["ACTIVE", "TRIALING", "PAST_DUE"].includes(sub.status) && sub.plan.active;
  if (sub && usable) {
    return { key: sub.plan.key, name: sub.plan.name, limits: normalizeLimits(sub.plan.limits), status: sub.status, provider: sub.provider };
  }
  const free = await db.plan.findUnique({ where: { key: "free" } });
  return {
    key: "free",
    name: free?.name ?? "Free",
    limits: normalizeLimits(free?.limits),
    status: sub?.status ?? "ACTIVE",
    provider: sub?.provider ?? "none",
  };
}
