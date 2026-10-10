import { z } from "zod";
import { route, json, parseJson, badRequest, conflict } from "@/server/http";
import { requireApiAuth } from "@/server/auth/session";
import { emailSchema, verifyUserPassword } from "@/server/auth/service";
import { enforceRateLimit, LIMITS } from "@/server/ratelimit";
import { db } from "@/server/db";
import { randomToken, sha256 } from "@/server/crypto";
import { appUrl } from "@/server/env";
import { sendEmail } from "@/server/email";
import { escapeHtml } from "@/server/email/templates";

const body = z.object({ email: z.string(), password: z.string().max(200) });

/** Starts an email change: a confirmation link is sent to the new address. */
export const POST = route(async (req) => {
  const { user } = await requireApiAuth({ verified: false });
  enforceRateLimit(`email-change:${user.id}`, LIMITS.authEmail.limit, LIMITS.authEmail.windowMs);
  const input = await parseJson(req, body);
  const email = emailSchema.parse(input.email);
  if (email === user.email) throw badRequest("That's already your email address.");
  if (!(await verifyUserPassword(user.id, input.password))) throw badRequest("Your password is incorrect.");
  if (await db.user.findUnique({ where: { email } })) throw conflict("Another account already uses that email.");
  const token = randomToken(32);
  await db.verificationToken.create({
    data: { userId: user.id, type: "EMAIL_CHANGE", tokenHash: sha256(token), expiresAt: new Date(Date.now() + 24 * 3600_000), data: { email } },
  });
  const url = appUrl(`/settings/email-confirm?token=${encodeURIComponent(token)}`);
  const result = await sendEmail({
    to: email,
    subject: "Confirm your new RANEDDIE ID email",
    text: `Confirm that you want to use this address for your RANEDDIE ID:\n${url}\n\nThis link expires in 24 hours.`,
    html: `<p>Confirm that you want to use <strong>${escapeHtml(email)}</strong> for your RANEDDIE ID.</p><p><a href="${url}">Confirm new email</a></p>`,
  });
  return json({ status: result.status });
});
