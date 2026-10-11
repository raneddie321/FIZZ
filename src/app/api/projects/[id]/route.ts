import { z } from "zod";
import { route, json, parseJson } from "@/server/http";
import { requireApiAuth } from "@/server/auth/session";
import { db } from "@/server/db";
import { getOwnedProject } from "@/server/projects/files";
import { projectSettings } from "@/server/projects/service";
import { audit } from "@/server/audit";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (_req, { params }) => {
  const { id } = await params;
  const { user } = await requireApiAuth();
  const project = await getOwnedProject(user.id, id);
  await db.project.update({ where: { id }, data: { lastOpenedAt: new Date() } });
  const git = await db.gitConnection.findUnique({ where: { projectId: id } });
  return json({ project: { ...project, settings: projectSettings(project.settings) }, git });
});

const patch = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(2000).optional(),
  stack: z.string().trim().max(120).optional(),
  archived: z.boolean().optional(),
  settings: z
    .object({
      model: z.string().max(100).nullable().optional(),
      commandApproval: z.enum(["always", "installs"]).optional(),
      reviewPlan: z.boolean().optional(),
      previewEntry: z.string().max(400).optional(),
      devServerPort: z.number().int().min(1024).max(65535).optional(),
    })
    .optional(),
});

export const PATCH = route<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { user } = await requireApiAuth();
  const project = await getOwnedProject(user.id, id);
  const input = await parseJson(req, patch);
  const updated = await db.project.update({
    where: { id },
    data: {
      name: input.name,
      description: input.description,
      stack: input.stack,
      ...(input.archived !== undefined ? { archivedAt: input.archived ? new Date() : null } : {}),
      ...(input.settings ? { settings: { ...projectSettings(project.settings), ...input.settings } } : {}),
    },
  });
  return json({ project: { ...updated, settings: projectSettings(updated.settings) } });
});

export const DELETE = route<Ctx>(async (_req, { params }) => {
  const { id } = await params;
  const { user } = await requireApiAuth();
  await getOwnedProject(user.id, id);
  await db.project.delete({ where: { id } });
  await audit({ userId: user.id, action: "project.deleted", targetType: "Project", targetId: id });
  return json({ ok: true });
});
