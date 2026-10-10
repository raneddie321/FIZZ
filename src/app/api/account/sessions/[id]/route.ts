import { route, json, notFound, badRequest } from "@/server/http";
import { requireApiAuth } from "@/server/auth/session";
import { db } from "@/server/db";
import { audit } from "@/server/audit";

export const DELETE = route<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  const { id } = await params;
  const { user, session } = await requireApiAuth({ verified: false });
  if (id === session.id) throw badRequest("Use Sign out to end your current session.");
  const res = await db.session.updateMany({ where: { id, userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
  if (!res.count) throw notFound();
  await audit({ userId: user.id, action: "auth.session_revoked", targetType: "Session", targetId: id });
  return json({ ok: true });
});
