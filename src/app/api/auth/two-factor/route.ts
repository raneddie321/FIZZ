import { z } from "zod";
import { route, json, parseJson, clientIp, unauthorized, badRequest } from "@/server/http";
import { getRawSession } from "@/server/auth/session";
import { verifySecondFactor } from "@/server/auth/service";
import { enforceRateLimit, LIMITS } from "@/server/ratelimit";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { safeNext } from "@/lib/safe-redirect";

const body = z.object({ code: z.string().min(6).max(20), next: z.string().optional() });

export const POST = route(async (req) => {
  const ctx = await getRawSession();
  if (!ctx) throw unauthorized();
  const input = await parseJson(req, body);
  enforceRateLimit(`2fa:${ctx.session.id}`, LIMITS.auth.limit, LIMITS.auth.windowMs);
  if (!(await verifySecondFactor(ctx.user.id, input.code))) {
    await audit({ userId: ctx.user.id, action: "auth.2fa_failed", ipAddress: clientIp(req) });
    throw badRequest("That code is not valid. Try again or use a recovery code.");
  }
  await db.session.update({ where: { id: ctx.session.id }, data: { twoFactorVerified: true } });
  return json({ redirect: safeNext(input.next) });
});
