import { route, json } from "@/server/http";
import { requireApiAuth } from "@/server/auth/session";
import { availableModelsFor } from "@/server/ai/models";
import { getProvider } from "@/server/ai/registry";
import { imageGenerationConfigured } from "@/server/ai/images";
import { flagEnabled } from "@/server/flags";
import { env } from "@/server/env";
import { getEffectivePlan } from "@/server/billing/subscriptions";

/** What the chat UI can offer this user right now (models, web search, image generation). */
export const GET = route(async () => {
  const { user } = await requireApiAuth();
  const [models, plan, searchFlag, imageFlag] = await Promise.all([
    availableModelsFor(user.id),
    getEffectivePlan(user.id),
    flagEnabled("chat.web_search", true),
    flagEnabled("chat.image_generation", true),
  ]);
  const prefs = ((user.preferences ?? {}) as { ai?: { defaultModel?: string | null; webSearchByDefault?: boolean } }).ai ?? {};
  const webSearchProviders = new Set(
    models.filter((m) => getProvider(m.provider)?.supportsWebSearch && (m.provider !== "anthropic" || env().ANTHROPIC_WEB_SEARCH_ENABLED)).map((m) => m.id),
  );
  return json({
    models: models.map((m) => ({
      id: m.id,
      name: m.displayName,
      description: m.description,
      provider: m.provider,
      available: m.available,
      reason: m.unavailableReason ?? null,
      isDefault: m.isDefault,
      vision: m.supportsVision,
      documents: m.supportsDocuments,
      webSearch: searchFlag && webSearchProviders.has(m.id),
    })),
    preferredModel: prefs.defaultModel ?? null,
    webSearchByDefault: Boolean(prefs.webSearchByDefault),
    imageGeneration: { enabled: imageFlag, configured: imageGenerationConfigured() },
    maxUploadMb: Math.min(plan.limits.maxUploadMb, 50),
  });
});
