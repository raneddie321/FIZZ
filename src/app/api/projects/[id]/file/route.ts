import { z } from "zod";
import { route, json, parseJson, badRequest, conflict } from "@/server/http";
import { requireApiAuth } from "@/server/auth/session";
import { deleteFile, getOwnedProject, readFile, renamePath, writeFile } from "@/server/projects/files";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { user } = await requireApiAuth();
  await getOwnedProject(user.id, id);
  const path = new URL(req.url).searchParams.get("path");
  if (!path) throw badRequest("path is required");
  const file = await readFile(id, path);
  return json({ path: file.path, content: file.content, encoding: file.encoding, size: file.size, updatedAt: file.updatedAt });
});

const put = z.object({
  path: z.string().max(400),
  content: z.string().max(1_100_000),
  encoding: z.enum(["utf8", "base64"]).default("utf8"),
  /** Optimistic concurrency: reject if the file changed since this timestamp. */
  baseUpdatedAt: z.string().optional(),
  author: z.enum(["USER", "DESIGN"]).default("USER"),
});

export const PUT = route<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { user } = await requireApiAuth();
  await getOwnedProject(user.id, id);
  const input = await parseJson(req, put);
  if (input.baseUpdatedAt) {
    const current = await readFile(id, input.path).catch(() => null);
    if (current && current.updatedAt.toISOString() !== input.baseUpdatedAt) {
      throw conflict("This file was changed elsewhere (for example by the agent). Reload it before saving.");
    }
  }
  const result = await writeFile(id, input.path, input.content, { author: input.author, userId: user.id }, input.encoding);
  const file = result?.file ?? (await readFile(id, input.path));
  return json({ path: file.path, updatedAt: file.updatedAt, size: file.size, changed: Boolean(result) });
});

export const DELETE = route<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { user } = await requireApiAuth();
  await getOwnedProject(user.id, id);
  const path = new URL(req.url).searchParams.get("path");
  if (!path) throw badRequest("path is required");
  const count = await deleteFile(id, path, { author: "USER", userId: user.id });
  return json({ deleted: count });
});

const rename = z.object({ from: z.string().max(400), to: z.string().max(400) });

export const PATCH = route<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { user } = await requireApiAuth();
  await getOwnedProject(user.id, id);
  const input = await parseJson(req, rename);
  const count = await renamePath(id, input.from, input.to, { author: "USER", userId: user.id });
  return json({ renamed: count });
});
