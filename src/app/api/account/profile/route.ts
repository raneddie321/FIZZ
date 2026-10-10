import { z } from "zod";
import { route, json, parseJson } from "@/server/http";
import { requireApiAuth } from "@/server/auth/session";
import { db } from "@/server/db";
import { displayNameSchema } from "@/server/auth/service";
import { audit } from "@/server/audit";

const body = z.object({
  displayName: displayNameSchema,
  avatarUrl: z.union([z.literal(""), z.url({ protocol: /^https$/, error: "Use an https:// image URL." }).max(500)]).optional(),
});

export const PATCH = route(async (req) => {
  const { user } = await requireApiAuth({ verified: false });
  const input = await parseJson(req, body);
  const updated = await db.user.update({
    where: { id: user.id },
    data: { displayName: input.displayName, avatarUrl: input.avatarUrl === "" ? null : input.avatarUrl },
    select: { displayName: true, avatarUrl: true },
  });
  await audit({ userId: user.id, action: "account.profile_updated" });
  return json({ user: updated });
});
