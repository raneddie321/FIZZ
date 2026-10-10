import "server-only";
import type { AiModel } from "@prisma/client";
import { db } from "../db";
import { badRequest, notConfigured, forbidden } from "../http";
import { getEffectivePlan } from "../billing/subscriptions";
import { getProvider } from "./registry";

export type ModelAvailability = AiModel & { available: boolean; unavailableReason?: string; providerConfigured: boolean };

export async function availableModelsFor(userId: string): Promise<ModelAvailability[]> {
  const [models, plan] = await Promise.all([
    db.aiModel.findMany({ where: { enabled: true }, orderBy: [{ sortOrder: "asc" }, { displayName: "asc" }] }),
    getEffectivePlan(userId),
  ]);
  return models.map((m) => {
    const provider = getProvider(m.provider);
    const providerConfigured = Boolean(provider?.configured());
    const planAllowed = m.allowedPlans.length === 0 || m.allowedPlans.includes(plan.key);
    return {
      ...m,
      providerConfigured,
      available: providerConfigured && planAllowed,
      unavailableReason: !providerConfigured ? "Provider not configured" : !planAllowed ? "Upgrade required" : undefined,
    };
  });
}

/** Picks the requested model (or the user's/platform default) and verifies the user may use it. */
export async function resolveModel(userId: string, requested?: string | null, preferred?: string | null) {
  const models = await availableModelsFor(userId);
  if (models.length === 0) throw notConfigured("No AI models are enabled. An administrator needs to configure a model.");
  if (requested) {
    const m = models.find((x) => x.id === requested);
    if (!m) throw badRequest("That model is not available.");
    if (!m.providerConfigured) throw notConfigured(`${m.displayName} isn't connected yet. An administrator needs to add the ${m.provider} API key.`);
    if (!m.available) throw forbidden(`${m.displayName} isn't included in your plan.`);
    return m;
  }
  const candidates = [preferred, models.find((m) => m.isDefault)?.id].filter(Boolean) as string[];
  for (const id of candidates) {
    const m = models.find((x) => x.id === id && x.available);
    if (m) return m;
  }
  const first = models.find((m) => m.available);
  if (!first) {
    throw notConfigured("No AI provider is configured yet. Add an API key for Anthropic or OpenAI to start chatting.");
  }
  return first;
}
