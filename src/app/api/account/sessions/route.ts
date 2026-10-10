import { route, json } from "@/server/http";
import { requireApiAuth } from "@/server/auth/session";
import { db } from "@/server/db";

export const GET = route(async () => {
  const { user, session } = await requireApiAuth({ verified: false });
  const sessions = await db.session.findMany({
    where: { userId: user.id, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastSeenAt: "desc" },
    select: { id: true, createdAt: true, lastSeenAt: true, expiresAt: true, ipAddress: true, userAgent: true, authMethod: true },
  });
  return json({ currentId: session.id, sessions });
});
