import { route, json } from "@/server/http";
import { requireApiAuth } from "@/server/auth/session";
import { db } from "@/server/db";

export const GET = route(async (req) => {
  const { user } = await requireApiAuth({ verified: false });
  const url = new URL(req.url);
  const unread = await db.notification.count({ where: { userId: user.id, readAt: null } });
  if (url.searchParams.get("countOnly")) return json({ unread });
  const notifications = await db.notification.findMany({
    where: { userId: user.id, ...(url.searchParams.get("unread") ? { readAt: null } : {}) },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return json({ unread, notifications });
});

/** Mark all as read. */
export const POST = route(async () => {
  const { user } = await requireApiAuth({ verified: false });
  await db.notification.updateMany({ where: { userId: user.id, readAt: null }, data: { readAt: new Date() } });
  return json({ ok: true });
});
