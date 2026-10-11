import { z } from "zod";
import { route, json, parseJson } from "@/server/http";
import { requireApiAuth } from "@/server/auth/session";
import { getOwnedProject, listFiles, requirePath, writeFile } from "@/server/projects/files";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (_req, { params }) => {
  const { id } = await params;
  const { user } = await requireApiAuth();
  await getOwnedProject(user.id, id);
  return json({ files: await listFiles(id) });
});

const body = z.object({ path: z.string().max(400), kind: z.enum(["file", "folder"]).default("file"), content: z.string().max(1_100_000).default("") });

export const POST = route<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { user } = await requireApiAuth();
  await getOwnedProject(user.id, id);
  const input = await parseJson(req, body);
  const path = requirePath(input.path);
  // Folders are implied by their files; an empty folder is kept with a .gitkeep placeholder.
  const target = input.kind === "folder" ? `${path}/.gitkeep` : path;
  await writeFile(id, target, input.kind === "folder" ? "" : input.content, { author: "USER", userId: user.id, message: `Created ${input.kind}` });
  return json({ path: target }, { status: 201 });
});
