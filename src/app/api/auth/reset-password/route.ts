import { z } from "zod";
import { route, json, parseJson, clientIp } from "@/server/http";
import { resetPassword } from "@/server/auth/service";
import { enforceRateLimit, LIMITS } from "@/server/ratelimit";

const body = z.object({ token: z.string().min(10).max(200), password: z.string() });

export const POST = route(async (req) => {
  const ip = clientIp(req);
  enforceRateLimit(`reset:${ip}`, LIMITS.auth.limit, LIMITS.auth.windowMs);
  const input = await parseJson(req, body);
  await resetPassword(input.token, input.password, ip);
  return json({ ok: true });
});
