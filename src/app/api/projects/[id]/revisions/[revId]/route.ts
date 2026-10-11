import { route, json, notFound } from "@/server/http";
import { requireApiAuth } from "@/server/auth/session";
import { db } from "@/server/db";
import { getOwnedProject, revertRevision } from "@/server/projects/files";

type Ctx = { params: Promise<{ id: string; revId: string }> };

export const GET = route<Ctx>(async (_req, { params }) => {
  const { id, revId } = await params;
  const { user } = await requireApiAuth();
  await getOwnedProject(user.id, id);
  const revision = await db.fileRevision.findFirst({ where: { id: revId, projectId: id } });
  if (!revision) throw notFound("Revision not found.");
  return json({ revision });
});

/** Undo this revision (restore the file to its previous state). */
export const POST = route<Ctx>(async (_req, { params }) => {
  const { id, revId } = await params;
  const { user } = await requireApiAuth();
  await getOwnedProject(user.id, id);
  await revertRevision(id, revId, { author: "USER", userId: user.id, message: `Reverted revision ${revId}` });
  return json({ ok: true });
});
