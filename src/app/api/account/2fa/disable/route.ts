import { z } from "zod";
import { route, json, parseJson } from "@/server/http";
import { requireApiAuth } from "@/server/auth/session";
import { disableTwoFactor } from "@/server/auth/service";
import { enforceRateLimit, LIMITS } from "@/server/ratelimit";

const body = z.object({ password: z.string().max(200) });

export const POST = route(async (req) => {
  const { user } = await requireApiAuth({ verified: false });
  enforceRateLimit(`2fa-disable:${user.id}`, LIMITS.auth.limit, LIMITS.auth.windowMs);
  const { password } = await parseJson(req, body);
  await disableTwoFactor(user.id, password);
  return json({ ok: true });
});
