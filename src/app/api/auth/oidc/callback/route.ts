import { NextResponse, type NextRequest } from "next/server";
import { completeAuthorization, OIDC_COOKIE, upsertOidcUser } from "@/server/auth/oidc";
import { verifySignedToken } from "@/server/crypto";
import { createSession } from "@/server/auth/session";
import { env } from "@/server/env";
import { clientIp } from "@/server/http";
import { audit } from "@/server/audit";
import { logError } from "@/server/errors";
import { safeNext } from "@/lib/safe-redirect";

export async function GET(req: NextRequest) {
  const base = env().APP_URL;
  const raw = req.cookies.get(OIDC_COOKIE)?.value;
  const checks = raw ? verifySignedToken<{ codeVerifier: string; state: string; nonce: string; next: string }>(raw) : null;
  if (!checks) return NextResponse.redirect(new URL("/signin?error=sso_expired", base));
  try {
    // Rebuild the callback URL on the public origin so it matches the registered redirect URI.
    const current = new URL(req.nextUrl.pathname + req.nextUrl.search, base);
    const identity = await completeAuthorization(current, checks);
    const user = await upsertOidcUser(identity);
    if (user.status !== "ACTIVE") return NextResponse.redirect(new URL("/signin?error=account_suspended", base));
    const ip = clientIp(req);
    // Multi-factor policy is enforced by the RANEDDIE ID provider for SSO sign-ins.
    await createSession(user.id, { twoFactorVerified: true, authMethod: "oidc", ipAddress: ip, userAgent: req.headers.get("user-agent") ?? undefined });
    await audit({ userId: user.id, action: "auth.login", metadata: { method: "oidc" }, ipAddress: ip });
    const res = NextResponse.redirect(new URL(safeNext(checks.next), base));
    res.cookies.delete({ name: OIDC_COOKIE, path: "/api/auth/oidc" });
    return res;
  } catch (error) {
    await logError("auth.oidc.callback", error);
    return NextResponse.redirect(new URL("/signin?error=sso_failed", base));
  }
}
