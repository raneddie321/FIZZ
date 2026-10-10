import { NextResponse, type NextRequest } from "next/server";

const PROTECTED = ["/chat", "/dev", "/settings", "/wallet", "/billing", "/usage", "/notifications", "/support", "/admin"];
const SESSION_COOKIE = "fizz_session";

/**
 * Optimistic routing guard: redirects visitors without a session cookie away
 * from app pages. Real authentication and authorization happen server-side in
 * layouts and route handlers.
 */
export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-fizz-pathname", pathname + search);

  const isProtected = PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (isProtected && !req.cookies.get(SESSION_COOKIE)) {
    const url = req.nextUrl.clone();
    url.pathname = "/signin";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|preview|monaco|brand|icon.svg|favicon.ico|fizz-inspector.js).*)"],
};
