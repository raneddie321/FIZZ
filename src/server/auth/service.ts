import "server-only";
import type { VerificationTokenType } from "@prisma/client";
import { z } from "zod";
import { db } from "../db";
import { appUrl, env } from "../env";
import { decrypt, encrypt, hashPassword, randomToken, sha256, verifyPassword } from "../crypto";
import { ApiError, badRequest, conflict, unauthorized } from "../http";
import { audit } from "../audit";
import { sendEmail } from "../email";
import { passwordChangedTemplate, resetPasswordTemplate, verifyEmailTemplate } from "../email/templates";
import { generateRecoveryCodes, generateTotpSecret, otpauthUrl, verifyTotp } from "./totp";
import { ensureFreeSubscription } from "../billing/subscriptions";

export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters.")
  .max(200, "Password is too long.")
  .refine((v) => /[a-zA-Z]/.test(v) && /[0-9]/.test(v), "Use a mix of letters and numbers.");

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Enter a valid email address.").max(254));

export const displayNameSchema = z.string().trim().min(1, "Enter your name.").max(80);

const HOUR = 60 * 60 * 1000;

async function issueToken(userId: string, type: VerificationTokenType, ttlMs: number, data?: Record<string, unknown>) {
  const token = randomToken(32);
  await db.verificationToken.updateMany({ where: { userId, type, usedAt: null }, data: { usedAt: new Date() } });
  await db.verificationToken.create({
    data: { userId, type, tokenHash: sha256(token), expiresAt: new Date(Date.now() + ttlMs), data: data ? JSON.parse(JSON.stringify(data)) : undefined },
  });
  return token;
}

async function consumeToken(token: string, type: VerificationTokenType) {
  const record = await db.verificationToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!record || record.type !== type || record.usedAt || record.expiresAt < new Date()) return null;
  const updated = await db.verificationToken.updateMany({ where: { id: record.id, usedAt: null }, data: { usedAt: new Date() } });
  if (updated.count !== 1) return null;
  return record;
}

export async function sendVerificationEmail(userId: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.emailVerifiedAt) return { status: "already_verified" as const };
  const token = await issueToken(user.id, "EMAIL_VERIFY", 24 * HOUR);
  const url = appUrl(`/verify-email/confirm?token=${encodeURIComponent(token)}`);
  const result = await sendEmail({ to: user.email, ...verifyEmailTemplate(user.displayName, url) });
  return { status: result.status };
}

export async function registerUser(input: { email: string; password: string; displayName: string; ip?: string }) {
  const email = emailSchema.parse(input.email);
  const password = passwordSchema.parse(input.password);
  const displayName = displayNameSchema.parse(input.displayName);
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) throw conflict("An account with this email already exists. Try signing in instead.");
  const user = await db.user.create({
    data: {
      email,
      displayName,
      passwordHash: await hashPassword(password),
      emailVerifiedAt: env().REQUIRE_EMAIL_VERIFICATION ? null : new Date(),
      identities: { create: { provider: "local", issuer: "raneddie-id-local", subject: email, email } },
    },
  });
  await ensureFreeSubscription(user.id);
  await audit({ userId: user.id, action: "auth.register", ipAddress: input.ip });
  if (env().REQUIRE_EMAIL_VERIFICATION) await sendVerificationEmail(user.id);
  return user;
}

export async function authenticatePassword(emailInput: string, password: string, ip?: string) {
  const email = emailSchema.safeParse(emailInput);
  const user = email.success ? await db.user.findUnique({ where: { email: email.data } }) : null;
  // Always run a hash comparison to keep timing uniform for unknown accounts.
  const valid = await verifyPassword(
    password,
    user?.passwordHash ?? "scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==",
  );
  if (!user || !valid || !user.passwordHash) {
    await audit({ userId: user?.id, action: "auth.login_failed", ipAddress: ip, metadata: { email: emailInput.slice(0, 254) } });
    throw unauthorized("That email and password combination is incorrect.");
  }
  if (user.status !== "ACTIVE") throw new ApiError(403, "account_suspended", "This account is not active. Contact support for help.");
  return user;
}

export async function verifyEmailToken(token: string) {
  const record = await consumeToken(token, "EMAIL_VERIFY");
  if (!record) return null;
  const user = await db.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: new Date() } });
  await audit({ userId: user.id, action: "auth.email_verified" });
  return user;
}

export async function requestPasswordReset(emailInput: string, ip?: string) {
  const email = emailSchema.safeParse(emailInput);
  if (!email.success) return;
  const user = await db.user.findUnique({ where: { email: email.data } });
  // Do not reveal whether the account exists.
  if (!user || user.status !== "ACTIVE") return;
  const token = await issueToken(user.id, "PASSWORD_RESET", HOUR);
  const url = appUrl(`/reset-password?token=${encodeURIComponent(token)}`);
  await sendEmail({ to: user.email, ...resetPasswordTemplate(user.displayName, url) });
  await audit({ userId: user.id, action: "auth.password_reset_requested", ipAddress: ip });
}

export async function resetPassword(token: string, newPassword: string, ip?: string) {
  const password = passwordSchema.parse(newPassword);
  const record = await consumeToken(token, "PASSWORD_RESET");
  if (!record) throw badRequest("This reset link is invalid or has expired. Request a new one.");
  const user = await db.user.update({
    where: { id: record.userId },
    data: { passwordHash: await hashPassword(password) },
  });
  // A successful reset proves control of the inbox.
  if (!user.emailVerifiedAt) await db.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
  await db.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
  await sendEmail({ to: user.email, ...passwordChangedTemplate(user.displayName) });
  await audit({ userId: user.id, action: "auth.password_reset", ipAddress: ip });
  return user;
}

export async function changePassword(userId: string, current: string, next: string, keepSessionId: string) {
  const password = passwordSchema.parse(next);
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.passwordHash && !(await verifyPassword(current, user.passwordHash))) {
    throw badRequest("Your current password is incorrect.");
  }
  await db.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(password) } });
  await db.session.updateMany({ where: { userId, revokedAt: null, id: { not: keepSessionId } }, data: { revokedAt: new Date() } });
  await sendEmail({ to: user.email, ...passwordChangedTemplate(user.displayName) });
  await audit({ userId, action: "auth.password_changed" });
}

export async function verifyUserPassword(userId: string, password: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.passwordHash) return false;
  return verifyPassword(password, user.passwordHash);
}

// ── Two-factor authentication ────────────────────────────────

export async function beginTwoFactorSetup(userId: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.twoFactorEnabled) throw conflict("Two-factor authentication is already enabled.");
  const secret = generateTotpSecret();
  // Stored encrypted but not active until confirmed with a valid code.
  await db.user.update({ where: { id: userId }, data: { twoFactorSecret: encrypt(secret) } });
  return { secret, otpauthUrl: otpauthUrl(secret, user.email) };
}

export async function confirmTwoFactorSetup(userId: string, code: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (user.twoFactorEnabled) throw conflict("Two-factor authentication is already enabled.");
  if (!user.twoFactorSecret) throw badRequest("Start two-factor setup first.");
  if (!verifyTotp(decrypt(user.twoFactorSecret), code)) throw badRequest("That code is not valid. Check your authenticator app and try again.");
  const recoveryCodes = generateRecoveryCodes();
  await db.user.update({
    where: { id: userId },
    data: { twoFactorEnabled: true, twoFactorRecoveryCodes: recoveryCodes.map((c) => sha256(c)) },
  });
  await audit({ userId, action: "auth.2fa_enabled" });
  return { recoveryCodes };
}

export async function disableTwoFactor(userId: string, password: string) {
  if (!(await verifyUserPassword(userId, password))) throw badRequest("Your password is incorrect.");
  await db.user.update({ where: { id: userId }, data: { twoFactorEnabled: false, twoFactorSecret: null, twoFactorRecoveryCodes: [] } });
  await audit({ userId, action: "auth.2fa_disabled" });
}

/** Verifies a TOTP or a one-time recovery code. */
export async function verifySecondFactor(userId: string, code: string): Promise<boolean> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.twoFactorEnabled || !user.twoFactorSecret) return true;
  const trimmed = code.trim();
  if (/^\d{6}$/.test(trimmed.replace(/\s/g, ""))) return verifyTotp(decrypt(user.twoFactorSecret), trimmed);
  const hash = sha256(trimmed.toUpperCase());
  if (!user.twoFactorRecoveryCodes.includes(hash)) return false;
  await db.user.update({
    where: { id: userId },
    data: { twoFactorRecoveryCodes: user.twoFactorRecoveryCodes.filter((c) => c !== hash) },
  });
  await audit({ userId, action: "auth.2fa_recovery_code_used" });
  return true;
}
