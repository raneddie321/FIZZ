import { route, json, notFound } from "@/server/http";
import { requireApiAuth } from "@/server/auth/session";
import { db } from "@/server/db";
import { audit } from "@/server/audit";

export const DELETE = route<{ params: Promise<{ service: string }> }>(async (_req, { params }) => {
  const { service } = await params;
  const { user } = await requireApiAuth();
  const res = await db.connectedService.deleteMany({ where: { userId: user.id, service } });
  if (!res.count) throw notFound();
  await audit({ userId: user.id, action: "account.service_disconnected", metadata: { service } });
  return json({ ok: true });
});
