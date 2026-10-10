import { NextResponse } from "next/server";
import { route } from "@/server/http";
import { requireApiAuth } from "@/server/auth/session";
import { db } from "@/server/db";
import { enforceRateLimit } from "@/server/ratelimit";
import { audit } from "@/server/audit";

export const GET = route(async () => {
  const { user } = await requireApiAuth({ verified: false });
  enforceRateLimit(`export:${user.id}`, 5, 60 * 60_000);
  const [profile, conversations, projects, wallet, purchases, usage, notifications, support] = await Promise.all([
    db.user.findUnique({
      where: { id: user.id },
      select: { id: true, email: true, displayName: true, createdAt: true, theme: true, language: true, preferences: true, twoFactorEnabled: true, role: true },
    }),
    db.conversation.findMany({
      where: { userId: user.id },
      include: { messages: { select: { role: true, content: true, createdAt: true, model: true } }, attachments: { select: { fileName: true, mimeType: true, size: true, createdAt: true } } },
    }),
    db.project.findMany({ where: { ownerId: user.id }, include: { files: { select: { path: true, content: true, encoding: true, updatedAt: true } } } }),
    db.wallet.findUnique({ where: { userId: user.id }, include: { entries: true } }),
    db.purchaseRequest.findMany({ where: { userId: user.id }, include: { approvals: true, transaction: true } }),
    db.usageRecord.findMany({ where: { userId: user.id }, select: { kind: true, quantity: true, model: true, createdAt: true } }),
    db.notification.findMany({ where: { userId: user.id } }),
    db.supportRequest.findMany({ where: { userId: user.id }, include: { replies: true } }),
  ]);
  await audit({ userId: user.id, action: "account.data_exported" });
  const payload = { exportedAt: new Date().toISOString(), profile, conversations, projects, wallet, purchases, usage, notifications, support };
  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="fizz-export-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
});
