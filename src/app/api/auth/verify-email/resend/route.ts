import { route, json, unauthorized } from "@/server/http";
import { getRawSession } from "@/server/auth/session";
import { sendVerificationEmail } from "@/server/auth/service";
import { enforceRateLimit, LIMITS } from "@/server/ratelimit";

export const POST = route(async () => {
  const ctx = await getRawSession();
  if (!ctx) throw unauthorized();
  enforceRateLimit(`verify-resend:${ctx.user.id}`, LIMITS.authEmail.limit, LIMITS.authEmail.windowMs, "You've requested several emails. Wait a while before trying again.");
  const result = await sendVerificationEmail(ctx.user.id);
  return json(result);
});
