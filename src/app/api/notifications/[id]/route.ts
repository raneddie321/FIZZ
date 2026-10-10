import { route, json, notFound } from "@/server/http";
import { requireApiAuth } from "@/server/auth/session";
import { db } from "@/server/db";

export const PATCH = route<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  const { id } = await params;
  const { user } = await requireApiAuth({ verified: false });
  const res = await db.notification.updateMany({ where: { id, userId: user.id }, data: { readAt: new Date() } });
  if (!res.count) throw notFound();
  return json({ ok: true });
});

export const DELETE = route<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  const { id } = await params;
  const { user } = await requireApiAuth({ verified: false });
  const res = await db.notification.deleteMany({ where: { id, userId: user.id } });
  if (!res.count) throw notFound();
  return json({ ok: true });
});
