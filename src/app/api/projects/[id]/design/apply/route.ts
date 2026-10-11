import { z } from "zod";
import { route, json, parseJson, badRequest } from "@/server/http";
import { requireApiAuth } from "@/server/auth/session";
import { getOwnedProject, readFile, writeFile } from "@/server/projects/files";
import { applyDesignChange, DesignEditError } from "@/server/projects/design";

const body = z.object({
  file: z.string().max(400),
  path: z.array(z.number().int().min(0).max(10_000)).max(200),
  tagName: z.string().max(40),
  change: z.object({
    style: z.record(z.string().max(60), z.string().max(500).nullable()).optional(),
    attributes: z.record(z.string().max(60), z.string().max(2000).nullable()).optional(),
    text: z.string().max(20_000).optional(),
  }),
});

/** Writes a visual-editor change back into the project's HTML source. */
export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const { id } = await params;
  const { user } = await requireApiAuth();
  await getOwnedProject(user.id, id);
  const input = await parseJson(req, body);
  if (!/\.html?$/i.test(input.file)) throw badRequest("Visual editing works on HTML files.");
  const file = await readFile(id, input.file);
  let next: string;
  try {
    next = applyDesignChange(file.content, input.path, input.tagName, input.change);
  } catch (error) {
    if (error instanceof DesignEditError) throw badRequest(error.message);
    throw error;
  }
  const result = await writeFile(id, file.path, next, { author: "DESIGN", userId: user.id, message: "Visual edit" });
  return json({ path: file.path, content: next, changed: Boolean(result), updatedAt: (result?.file ?? file).updatedAt });
});
