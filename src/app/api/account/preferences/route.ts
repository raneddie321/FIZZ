import { z } from "zod";
import { route, json, parseJson } from "@/server/http";
import { requireApiAuth } from "@/server/auth/session";
import { db } from "@/server/db";

const body = z.object({
  theme: z.enum(["light", "dark", "system"]).optional(),
  language: z.enum(["en", "es", "fr", "de", "pt", "it", "nl", "ja", "ko", "zh", "ar", "hi"]).optional(),
  notifications: z
    .object({
      productUpdates: z.boolean(),
      agentTaskEmails: z.boolean(),
      purchaseEmails: z.boolean(),
      securityEmails: z.boolean(),
    })
    .partial()
    .optional(),
  ai: z
    .object({
      defaultModel: z.string().max(100).nullable(),
      customInstructions: z.string().max(2000),
      responseStyle: z.enum(["balanced", "concise", "detailed"]),
      webSearchByDefault: z.boolean(),
    })
    .partial()
    .optional(),
});

export const PATCH = route(async (req) => {
  const { user } = await requireApiAuth({ verified: false });
  const input = await parseJson(req, body);
  const current = (user.preferences ?? {}) as Record<string, Record<string, unknown> | undefined>;
  const preferences = {
    ...current,
    ...(input.notifications ? { notifications: { ...(current.notifications ?? {}), ...input.notifications } } : {}),
    ...(input.ai ? { ai: { ...(current.ai ?? {}), ...input.ai } } : {}),
  };
  await db.user.update({
    where: { id: user.id },
    data: { theme: input.theme, language: input.language, preferences },
  });
  return json({ ok: true });
});
