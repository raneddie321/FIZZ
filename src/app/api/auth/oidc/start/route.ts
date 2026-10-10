import { NextResponse, type NextRequest } from "next/server";
import { buildAuthorizationRequest, OIDC_COOKIE } from "@/server/auth/oidc";
import { signToken } from "@/server/crypto";
import { env, oidcEnabled } from "@/server/env";
import { safeNext } from "@/lib/safe-redirect";
import { logError } from "@/server/errors";

export async function GET(req: NextRequest) {
  if (!oidcEnabled()) {
    return NextResponse.redirect(new URL("/signin?error=sso_not_configured", env().APP_URL));
  }
  try {
    const next = safeNext(req.nextUrl.searchParams.get("next"));
    const { url, codeVerifier, state, nonce } = await buildAuthorizationRequest();
    const res = NextResponse.redirect(url);
    res.cookies.set(OIDC_COOKIE, signToken({ codeVerifier, state, nonce, next }, 600), {
      httpOnly: true,
      secure: env().APP_URL.startsWith("https://"),
      sameSite: "lax",
      path: "/api/auth/oidc",
      maxAge: 600,
    });
    return res;
  } catch (error) {
    await logError("auth.oidc.start", error);
    return NextResponse.redirect(new URL("/signin?error=sso_unavailable", env().APP_URL));
  }
}
