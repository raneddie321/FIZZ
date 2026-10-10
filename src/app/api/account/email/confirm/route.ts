import { z } from "zod";
import { route, json, parseJson, badRequest, conflict } from "@/server/http";
import { requireApiAuth } from "@/server/auth/session";
import { db } from "@/server/db";
import { sha256 } from "@/server/crypto";
import { audit } from "@/server/audit";
import { sendEmail } from "@/server/email";

const body = z.object({ token: z.string().min(10).max(200) });

export const POST = route(async (req) => {
  const { user } = await requireApiAuth({ verified: false });
  const { token } = await parseJson(req, body);
  const record = await db.verificationToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!record || record.type !== "EMAIL_CHANGE" || record.userId !== user.id || record.usedAt || record.expiresAt < new Date()) {
    throw badRequest("This confirmation link is invalid or has expired.");
  }
  const email = (record.data as { email?: string } | null)?.email;
  if (!email) throw badRequest("This confirmation link is invalid.");
  if (await db.user.findUnique({ where: { email } })) throw conflict("Another account already uses that email.");
  const previous = user.email;
  await db.$transaction([
    db.verificationToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    db.user.update({ where: { id: user.id }, data: { email, emailVerifiedAt: new Date() } }),
    db.identityMapping.updateMany({ where: { userId: user.id, provider: "local" }, data: { subject: email, email } }),
  ]);
  await sendEmail({ to: previous, subject: "Your RANEDDIE ID email was changed", text: `The email for your RANEDDIE ID was changed to ${email}. If this wasn't you, contact support immediately.` });
  await audit({ userId: user.id, action: "account.email_changed", metadata: { from: previous, to: email } });
  return json({ ok: true });
});
