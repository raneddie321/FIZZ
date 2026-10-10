import { z } from "zod";
import { route, json, parseJson, clientIp } from "@/server/http";
import { requestPasswordReset } from "@/server/auth/service";
import { enforceRateLimit, LIMITS } from "@/server/ratelimit";

const body = z.object({ email: z.string().max(254) });

export const POST = route(async (req) => {
  const ip = clientIp(req);
  enforceRateLimit(`forgot:${ip}`, LIMITS.authEmail.limit, LIMITS.authEmail.windowMs);
  const { email } = await parseJson(req, body);
  await requestPasswordReset(email, ip);
  // Same response regardless of whether the account exists.
  return json({ ok: true });
});
