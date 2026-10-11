import { z } from "zod";
import { route, json, parseJson } from "@/server/http";
import { requireApiAuth } from "@/server/auth/session";
import { getOwnedProject, replaceInFiles } from "@/server/projects/files";

const body = z.object({
  find: z.string().min(1).max(500),
  replace: z.string().max(5000),
  regex: z.boolean().default(false),
  caseSensitive: z.boolean().default(false),
  paths: z.array(z.string().max(400)).max(2000).optional(),
});

export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const { id } = await params;
  const { user } = await requireApiAuth();
  await getOwnedProject(user.id, id);
  const input = await parseJson(req, body);
  const result = await replaceInFiles(id, input.find, input.replace, input, { author: "USER", userId: user.id, message: `Replace "${input.find}"` });
  return json(result);
});
