import { z } from "zod";
import { route, json, parseJson, clientIp, forbidden } from "@/server/http";
import { authenticatePassword } from "@/server/auth/service";
import { createSession } from "@/server/auth/session";
import { enforceRateLimit, LIMITS } from "@/server/ratelimit";
import { localAuthEnabled } from "@/server/env";
import { audit } from "@/server/audit";
import { safeNext } from "@/lib/safe-redirect";

const body = z.object({ email: z.string().max(254), password: z.string().max(200), next: z.string().optional() });

export const POST = route(async (req) => {
  if (!localAuthEnabled()) throw forbidden("Sign in with RANEDDIE ID.");
  const ip = clientIp(req);
  const input = await parseJson(req, body);
  enforceRateLimit(`login:ip:${ip}`, LIMITS.auth.limit * 3, LIMITS.auth.windowMs, "Too many sign-in attempts. Try again in a few minutes.");
  enforceRateLimit(`login:email:${input.email.toLowerCase()}`, LIMITS.auth.limit, LIMITS.auth.windowMs, "Too many sign-in attempts for this account. Try again in a few minutes.");
  const user = await authenticatePassword(input.email, input.password, ip);
  await createSession(user.id, {
    twoFactorVerified: !user.twoFactorEnabled,
    authMethod: "password",
    ipAddress: ip,
    userAgent: req.headers.get("user-agent") ?? undefined,
  });
  await audit({ userId: user.id, action: "auth.login", ipAddress: ip });
  const next = safeNext(input.next);
  if (user.twoFactorEnabled) return json({ redirect: `/signin/two-factor?next=${encodeURIComponent(next)}` });
  return json({ redirect: next });
});
