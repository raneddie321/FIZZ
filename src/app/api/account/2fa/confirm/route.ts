import { z } from "zod";
import { route, json, parseJson } from "@/server/http";
import { requireApiAuth } from "@/server/auth/session";
import { confirmTwoFactorSetup } from "@/server/auth/service";
import { db } from "@/server/db";
import { enforceRateLimit, LIMITS } from "@/server/ratelimit";

const body = z.object({ code: z.string().min(6).max(8) });

export const POST = route(async (req) => {
  const { user, session } = await requireApiAuth({ verified: false });
  enforceRateLimit(`2fa-confirm:${user.id}`, LIMITS.auth.limit, LIMITS.auth.windowMs);
  const { code } = await parseJson(req, body);
  const result = await confirmTwoFactorSetup(user.id, code);
  // The current session just proved possession of the second factor.
  await db.session.update({ where: { id: session.id }, data: { twoFactorVerified: true } });
  return json(result);
});
