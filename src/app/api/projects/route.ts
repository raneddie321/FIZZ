import { z } from "zod";
import { route, json, parseJson } from "@/server/http";
import { requireApiAuth } from "@/server/auth/session";
import { db } from "@/server/db";
import { createProject, PROJECT_TYPES } from "@/server/projects/service";
import { enforceRateLimit } from "@/server/ratelimit";

export const GET = route(async (req) => {
  const { user } = await requireApiAuth();
  const archived = new URL(req.url).searchParams.get("archived") === "1";
  const projects = await db.project.findMany({
    where: { ownerId: user.id, archivedAt: archived ? { not: null } : null },
    orderBy: { lastOpenedAt: "desc" },
    take: 200,
    select: {
      id: true, name: true, description: true, type: true, stack: true, template: true, updatedAt: true, lastOpenedAt: true, archivedAt: true,
      _count: { select: { files: true, agentTasks: true } },
    },
  });
  return json({ projects });
});

const body = z.object({
  name: z.string().trim().min(1, "Give your project a name.").max(80),
  description: z.string().trim().max(2000).default(""),
  type: z.enum(PROJECT_TYPES as [string, ...string[]]),
  template: z.string().max(40),
  stack: z.string().trim().max(120).optional(),
});

export const POST = route(async (req) => {
  const { user } = await requireApiAuth();
  enforceRateLimit(`project-create:${user.id}`, 20, 60 * 60_000);
  const input = await parseJson(req, body);
  const project = await createProject(user.id, { ...input, type: input.type as (typeof PROJECT_TYPES)[number] });
  return json({ project: { id: project.id } }, { status: 201 });
});
