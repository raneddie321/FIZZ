import { z } from "zod";
import { route, json, parseJson, badRequest, clientIp } from "@/server/http";
import { verifyEmailToken } from "@/server/auth/service";
import { enforceRateLimit, LIMITS } from "@/server/ratelimit";

const body = z.object({ token: z.string().min(10).max(200) });

export const POST = route(async (req) => {
  enforceRateLimit(`verify:${clientIp(req)}`, LIMITS.auth.limit, LIMITS.auth.windowMs);
  const { token } = await parseJson(req, body);
  const user = await verifyEmailToken(token);
  if (!user) throw badRequest("This verification link is invalid or has expired. Request a new one from the verification page.");
  return json({ ok: true });
});
