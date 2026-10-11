import { route, json } from "@/server/http";
import { requireApiAuth } from "@/server/auth/session";
import { db } from "@/server/db";
import { getOwnedProject } from "@/server/projects/files";

export const GET = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const { id } = await params;
  const { user } = await requireApiAuth();
  await getOwnedProject(user.id, id);
  const sp = new URL(req.url).searchParams;
  const path = sp.get("path");
  const taskId = sp.get("taskId");
  const revisions = await db.fileRevision.findMany({
    where: { projectId: id, ...(path ? { OR: [{ path }, { previousPath: path }] } : {}), ...(taskId ? { agentTaskId: taskId } : {}) },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { id: true, path: true, previousPath: true, operation: true, author: true, agentTaskId: true, message: true, revertedAt: true, createdAt: true },
  });
  return json({ revisions });
});
