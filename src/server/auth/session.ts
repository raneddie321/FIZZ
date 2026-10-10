import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Role, Session, User } from "@prisma/client";
import { db } from "../db";
import { env } from "../env";
import { randomToken, sha256 } from "../crypto";
import { forbidden, unauthorized } from "../http";
import { hasRole } from "./roles";

export const SESSION_COOKIE = "fizz_session";
const DAY = 24 * 60 * 60 * 1000;
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

export type SessionUser = Pick<
  User,
  | "id"
  | "email"
  | "displayName"
  | "avatarUrl"
  | "role"
  | "status"
  | "emailVerifiedAt"
  | "twoFactorEnabled"
  | "theme"
  | "language"
  | "preferences"
>;

export type AuthContext = { session: Session; user: SessionUser };

const userSelect = {
  id: true,
  email: true,
  displayName: true,
  avatarUrl: true,
  role: true,
  status: true,
  emailVerifiedAt: true,
  twoFactorEnabled: true,
  theme: true,
  language: true,
  preferences: true,
} as const;

function cookieOptions(expires: Date) {
  return {
    httpOnly: true,
    secure: env().APP_URL.startsWith("https://"),
    sameSite: "lax" as const,
    path: "/",
    expires,
  };
}

export async function createSession(
  userId: string,
  opts: { twoFactorVerified: boolean; authMethod: string; ipAddress?: string; userAgent?: string },
) {
  const token = randomToken(32);
  const now = Date.now();
  const absoluteExpiresAt = new Date(now + env().SESSION_ABSOLUTE_DAYS * DAY);
  const expiresAt = new Date(Math.min(now + env().SESSION_IDLE_DAYS * DAY, absoluteExpiresAt.getTime()));
  const session = await db.session.create({
    data: {
      tokenHash: sha256(token),
      userId,
      expiresAt,
      absoluteExpiresAt,
      twoFactorVerified: opts.twoFactorVerified,
      authMethod: opts.authMethod,
      ipAddress: opts.ipAddress,
      userAgent: opts.userAgent?.slice(0, 400),
    },
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, cookieOptions(absoluteExpiresAt));
  await db.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
  return session;
}

/** Resolves the current session (memoised per request). Does not enforce 2FA. */
export const getRawSession = cache(async (): Promise<AuthContext | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: { select: userSelect } },
  });
  if (!session) return null;
  const now = Date.now();
  if (session.revokedAt || session.expiresAt.getTime() < now || session.absoluteExpiresAt.getTime() < now) return null;
  if (session.user.status !== "ACTIVE") return null;

  if (now - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    const expiresAt = new Date(Math.min(now + env().SESSION_IDLE_DAYS * DAY, session.absoluteExpiresAt.getTime()));
    await db.session
      .update({ where: { id: session.id }, data: { lastSeenAt: new Date(now), expiresAt } })
      .catch(() => undefined);
  }
  const { user, ...rest } = session;
  return { session: rest, user };
});

function twoFactorSatisfied(ctx: AuthContext) {
  return !ctx.user.twoFactorEnabled || ctx.session.twoFactorVerified;
}

/** Current fully-authenticated user, or null. */
export const getAuth = cache(async (): Promise<AuthContext | null> => {
  const ctx = await getRawSession();
  if (!ctx || !twoFactorSatisfied(ctx)) return null;
  return ctx;
});

// ── For server components / pages ────────────────────────────

export async function requirePageAuth(opts: { verified?: boolean } = {}): Promise<AuthContext> {
  const raw = await getRawSession();
  const h = await headers();
  const path = h.get("x-fizz-pathname") ?? "/chat";
  if (!raw) redirect(`/signin?next=${encodeURIComponent(path)}`);
  if (!twoFactorSatisfied(raw)) redirect(`/signin/two-factor?next=${encodeURIComponent(path)}`);
  if (opts.verified !== false && env().REQUIRE_EMAIL_VERIFICATION && !raw.user.emailVerifiedAt) {
    redirect(`/verify-email?next=${encodeURIComponent(path)}`);
  }
  return raw;
}

export async function requirePageRole(role: Role): Promise<AuthContext> {
  const ctx = await requirePageAuth();
  if (!hasRole(ctx.user.role, role)) redirect("/chat");
  return ctx;
}

// ── For route handlers ───────────────────────────────────────

export async function requireApiAuth(opts: { verified?: boolean } = {}): Promise<AuthContext> {
  const ctx = await getAuth();
  if (!ctx) throw unauthorized();
  if (opts.verified !== false && env().REQUIRE_EMAIL_VERIFICATION && !ctx.user.emailVerifiedAt) {
    throw forbidden("Verify your email address to use this feature.");
  }
  return ctx;
}

export async function requireApiRole(role: Role): Promise<AuthContext> {
  const ctx = await requireApiAuth();
  if (!hasRole(ctx.user.role, role)) throw forbidden();
  return ctx;
}

export async function destroyCurrentSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.session.updateMany({ where: { tokenHash: sha256(token) }, data: { revokedAt: new Date() } });
  }
  jar.delete(SESSION_COOKIE);
}

export async function revokeOtherSessions(userId: string, keepSessionId?: string) {
  await db.session.updateMany({
    where: { userId, revokedAt: null, ...(keepSessionId ? { id: { not: keepSessionId } } : {}) },
    data: { revokedAt: new Date() },
  });
}
