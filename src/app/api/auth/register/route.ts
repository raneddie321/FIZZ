import { z } from "zod";
import { route, json, parseJson, clientIp, forbidden } from "@/server/http";
import { registerUser } from "@/server/auth/service";
import { createSession } from "@/server/auth/session";
import { enforceRateLimit, LIMITS } from "@/server/ratelimit";
import { env, localAuthEnabled } from "@/server/env";
import { safeNext } from "@/lib/safe-redirect";

const body = z.object({
  email: z.string(),
  password: z.string(),
  displayName: z.string(),
  next: z.string().optional(),
  acceptTerms: z.literal(true, { error: "You need to accept the terms to create an account." }),
});

export const POST = route(async (req) => {
  if (!localAuthEnabled()) throw forbidden("Create your account with RANEDDIE ID.");
  const ip = clientIp(req);
  enforceRateLimit(`register:${ip}`, LIMITS.authEmail.limit, LIMITS.authEmail.windowMs);
  const input = await parseJson(req, body);
  const user = await registerUser({ ...input, ip });
  await createSession(user.id, { twoFactorVerified: true, authMethod: "password", ipAddress: ip, userAgent: req.headers.get("user-agent") ?? undefined });
  const next = safeNext(input.next);
  return json({
    redirect: env().REQUIRE_EMAIL_VERIFICATION ? `/verify-email?next=${encodeURIComponent(next)}` : next,
  });
});
