import { route, json } from "@/server/http";
import { requireApiAuth } from "@/server/auth/session";
import { db } from "@/server/db";

export const GET = route(async (req) => {
  const { user } = await requireApiAuth();
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim().slice(0, 200);
  const archived = url.searchParams.get("archived") === "1";
  const conversations = await db.conversation.findMany({
    where: {
      userId: user.id,
      archivedAt: archived ? { not: null } : null,
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" as const } },
              { messages: { some: { content: { contains: q, mode: "insensitive" as const } } } },
            ],
          }
        : {}),
    },
    orderBy: { lastMessageAt: "desc" },
    take: 200,
    select: { id: true, title: true, lastMessageAt: true, archivedAt: true, model: true },
  });
  return json({ conversations });
});
