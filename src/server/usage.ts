import "server-only";
import type { UsageKind } from "@prisma/client";
import { db } from "./db";
import { limitReached } from "./http";
import { getEffectivePlan } from "./billing/subscriptions";
import type { PlanLimits } from "@/lib/plans";

export function startOfUtcDay(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
export function startOfUtcMonth(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export async function recordUsage(entry: {
  userId: string;
  kind: UsageKind;
  quantity?: number;
  provider?: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  metadata?: Record<string, unknown>;
}) {
  await db.usageRecord.create({
    data: {
      userId: entry.userId,
      kind: entry.kind,
      quantity: entry.quantity ?? 1,
      provider: entry.provider,
      model: entry.model,
      inputTokens: entry.inputTokens,
      outputTokens: entry.outputTokens,
      metadata: JSON.parse(JSON.stringify(entry.metadata ?? {})),
    },
  });
}

export async function usageSince(userId: string, kind: UsageKind, since: Date) {
  const agg = await db.usageRecord.aggregate({ where: { userId, kind, createdAt: { gte: since } }, _sum: { quantity: true } });
  return agg._sum.quantity ?? 0;
}

type DailyLimitKey = "messagesPerDay" | "agentRunsPerDay" | "imageGenerationsPerDay" | "webSearchesPerDay" | "browserActionsPerDay";

const DAILY: Record<DailyLimitKey, { kind: UsageKind; label: string }> = {
  messagesPerDay: { kind: "CHAT_MESSAGE", label: "chat messages" },
  agentRunsPerDay: { kind: "AGENT_RUN", label: "agent runs" },
  imageGenerationsPerDay: { kind: "IMAGE_GENERATION", label: "image generations" },
  webSearchesPerDay: { kind: "WEB_SEARCH", label: "web searches" },
  browserActionsPerDay: { kind: "BROWSER_ACTION", label: "browser actions" },
};

/** Throws a 402 `limit_reached` error when the user's plan quota is exhausted. */
export async function assertDailyQuota(userId: string, key: DailyLimitKey, limits?: PlanLimits) {
  const plan = limits ?? (await getEffectivePlan(userId)).limits;
  const max = plan[key];
  if (max === null) return;
  const { kind, label } = DAILY[key];
  const used = await usageSince(userId, kind, startOfUtcDay());
  if (used >= max) {
    throw limitReached(
      max === 0
        ? `Your plan does not include ${label}. Upgrade your plan to use this feature.`
        : `You've reached today's limit of ${max} ${label}. It resets at midnight UTC, or you can upgrade your plan.`,
    );
  }
}

export async function assertTerminalQuota(userId: string) {
  const { limits } = await getEffectivePlan(userId);
  if (limits.terminalMinutesPerMonth === null) return;
  const usedSeconds = await usageSince(userId, "TERMINAL_SECONDS", startOfUtcMonth());
  if (usedSeconds >= limits.terminalMinutesPerMonth * 60) {
    throw limitReached(
      limits.terminalMinutesPerMonth === 0
        ? "Your plan does not include sandbox terminal time. Upgrade your plan to run commands."
        : `You've used this month's ${limits.terminalMinutesPerMonth} sandbox minutes.`,
    );
  }
}

export async function usageSummary(userId: string) {
  const day = startOfUtcDay();
  const month = startOfUtcMonth();
  const [plan, messages, agentRuns, images, searches, browser, terminalSeconds, tokens, projects] = await Promise.all([
    getEffectivePlan(userId),
    usageSince(userId, "CHAT_MESSAGE", day),
    usageSince(userId, "AGENT_RUN", day),
    usageSince(userId, "IMAGE_GENERATION", day),
    usageSince(userId, "WEB_SEARCH", day),
    usageSince(userId, "BROWSER_ACTION", day),
    usageSince(userId, "TERMINAL_SECONDS", month),
    db.usageRecord.aggregate({ where: { userId, kind: "TOKENS", createdAt: { gte: month } }, _sum: { inputTokens: true, outputTokens: true } }),
    db.project.count({ where: { ownerId: userId, archivedAt: null } }),
  ]);
  return {
    plan,
    daily: { messages, agentRuns, images, searches, browser },
    monthly: {
      terminalMinutes: Math.ceil(terminalSeconds / 60),
      inputTokens: tokens._sum.inputTokens ?? 0,
      outputTokens: tokens._sum.outputTokens ?? 0,
    },
    projects,
  };
}
