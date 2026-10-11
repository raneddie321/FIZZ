import "server-only";
import type { ChangeAuthor, Prisma, Project } from "@prisma/client";
import { db } from "../db";
import { badRequest, conflict, notFound, ApiError } from "../http";
import { normalizeProjectPath } from "@/lib/paths";

export const MAX_FILE_BYTES = 1024 * 1024; // 1 MB per file
export const MAX_PROJECT_BYTES = 50 * 1024 * 1024;
export const MAX_FILES = 2000;

export type ChangeContext = { author: ChangeAuthor; userId?: string; agentTaskId?: string; message?: string };

export function requirePath(input: string): string {
  const p = normalizeProjectPath(input);
  if (!p) throw badRequest(`"${String(input).slice(0, 100)}" is not a valid file path.`);
  return p;
}

export async function getOwnedProject(userId: string, projectId: string): Promise<Project> {
  const project = await db.project.findFirst({ where: { id: projectId, ownerId: userId } });
  if (!project) throw notFound("Project not found.");
  return project;
}

export async function listFiles(projectId: string) {
  return db.projectFile.findMany({
    where: { projectId },
    select: { path: true, size: true, encoding: true, updatedAt: true },
    orderBy: { path: "asc" },
  });
}

export async function readFile(projectId: string, path: string) {
  const file = await db.projectFile.findUnique({ where: { projectId_path: { projectId, path: requirePath(path) } } });
  if (!file) throw notFound(`File "${path}" does not exist.`);
  return file;
}

async function assertCapacity(tx: Prisma.TransactionClient, projectId: string, addingBytes: number, newFile: boolean) {
  const agg = await tx.projectFile.aggregate({ where: { projectId }, _sum: { size: true }, _count: true });
  if (newFile && agg._count >= MAX_FILES) throw new ApiError(413, "project_full", `Projects can contain at most ${MAX_FILES} files.`);
  if ((agg._sum.size ?? 0) + addingBytes > MAX_PROJECT_BYTES) throw new ApiError(413, "project_full", "This project has reached its 50 MB storage limit.");
}

/** Creates or overwrites a file and records a revision. Returns null when content is unchanged. */
export async function writeFile(projectId: string, path: string, content: string, ctx: ChangeContext, encoding: "utf8" | "base64" = "utf8") {
  const p = requirePath(path);
  const size = encoding === "base64" ? Buffer.byteLength(content, "base64") : Buffer.byteLength(content, "utf8");
  if (size > MAX_FILE_BYTES) throw new ApiError(413, "file_too_large", `"${p}" is larger than the 1 MB per-file limit.`);
  return db.$transaction(async (tx) => {
    const existing = await tx.projectFile.findUnique({ where: { projectId_path: { projectId, path: p } } });
    if (existing && existing.content === content && existing.encoding === encoding) return null;
    // A file can't share its path with a folder.
    const asFolder = await tx.projectFile.findFirst({ where: { projectId, path: { startsWith: `${p}/` } }, select: { id: true } });
    if (asFolder) throw conflict(`"${p}" is a folder.`);
    const parents = p.split("/").slice(0, -1).map((_, i, arr) => arr.slice(0, i + 1).join("/"));
    if (parents.length) {
      const clash = await tx.projectFile.findFirst({ where: { projectId, path: { in: parents } }, select: { path: true } });
      if (clash) throw conflict(`"${clash.path}" is a file, so it can't contain other files.`);
    }
    await assertCapacity(tx, projectId, size - (existing?.size ?? 0), !existing);
    const file = await tx.projectFile.upsert({
      where: { projectId_path: { projectId, path: p } },
      create: { projectId, path: p, content, encoding, size },
      update: { content, encoding, size },
    });
    await tx.fileRevision.create({
      data: {
        projectId,
        path: p,
        operation: existing ? "UPDATE" : "CREATE",
        content,
        previousContent: existing?.content ?? null,
        encoding,
        author: ctx.author,
        userId: ctx.userId,
        agentTaskId: ctx.agentTaskId,
        message: ctx.message,
      },
    });
    await tx.project.update({ where: { id: projectId }, data: { updatedAt: new Date() } });
    return { file, created: !existing };
  });
}

export async function deleteFile(projectId: string, path: string, ctx: ChangeContext) {
  const p = requirePath(path);
  return db.$transaction(async (tx) => {
    const files = await tx.projectFile.findMany({ where: { projectId, OR: [{ path: p }, { path: { startsWith: `${p}/` } }] } });
    if (!files.length) throw notFound(`"${p}" does not exist.`);
    for (const f of files) {
      await tx.fileRevision.create({
        data: { projectId, path: f.path, operation: "DELETE", content: null, previousContent: f.content, encoding: f.encoding, author: ctx.author, userId: ctx.userId, agentTaskId: ctx.agentTaskId, message: ctx.message },
      });
    }
    await tx.projectFile.deleteMany({ where: { id: { in: files.map((f) => f.id) } } });
    await tx.project.update({ where: { id: projectId }, data: { updatedAt: new Date() } });
    return files.length;
  });
}

/** Renames a file or a whole folder. */
export async function renamePath(projectId: string, from: string, to: string, ctx: ChangeContext) {
  const src = requirePath(from);
  const dst = requirePath(to);
  if (src === dst) return 0;
  if (dst.startsWith(`${src}/`)) throw badRequest("A folder can't be moved inside itself.");
  return db.$transaction(async (tx) => {
    const files = await tx.projectFile.findMany({ where: { projectId, OR: [{ path: src }, { path: { startsWith: `${src}/` } }] } });
    if (!files.length) throw notFound(`"${src}" does not exist.`);
    for (const f of files) {
      const target = f.path === src ? dst : `${dst}${f.path.slice(src.length)}`;
      const clash = await tx.projectFile.findUnique({ where: { projectId_path: { projectId, path: target } } });
      if (clash) throw conflict(`"${target}" already exists.`);
      await tx.projectFile.update({ where: { id: f.id }, data: { path: target } });
      await tx.fileRevision.create({
        data: { projectId, path: target, previousPath: f.path, operation: "RENAME", content: f.content, previousContent: f.content, encoding: f.encoding, author: ctx.author, userId: ctx.userId, agentTaskId: ctx.agentTaskId, message: ctx.message },
      });
    }
    await tx.project.update({ where: { id: projectId }, data: { updatedAt: new Date() } });
    return files.length;
  });
}

export type SearchMatch = { path: string; line: number; column: number; text: string };

export async function searchFiles(projectId: string, query: string, opts: { regex?: boolean; caseSensitive?: boolean; pathPrefix?: string; limit?: number } = {}) {
  if (!query) return { matches: [] as SearchMatch[], truncated: false };
  let re: RegExp;
  try {
    re = opts.regex
      ? new RegExp(query, opts.caseSensitive ? "g" : "gi")
      : new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), opts.caseSensitive ? "g" : "gi");
  } catch {
    throw badRequest("That regular expression is invalid.");
  }
  const files = await db.projectFile.findMany({
    where: { projectId, encoding: "utf8", ...(opts.pathPrefix ? { path: { startsWith: opts.pathPrefix } } : {}) },
    select: { path: true, content: true },
    orderBy: { path: "asc" },
  });
  const limit = opts.limit ?? 500;
  const matches: SearchMatch[] = [];
  for (const f of files) {
    const lines = f.content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      re.lastIndex = 0;
      const m = re.exec(lines[i]!);
      if (m) {
        matches.push({ path: f.path, line: i + 1, column: m.index + 1, text: lines[i]!.slice(0, 300) });
        if (matches.length >= limit) return { matches, truncated: true };
      }
    }
  }
  return { matches, truncated: false };
}

export async function replaceInFiles(projectId: string, find: string, replacement: string, opts: { regex?: boolean; caseSensitive?: boolean; paths?: string[] }, ctx: ChangeContext) {
  let re: RegExp;
  try {
    re = opts.regex ? new RegExp(find, opts.caseSensitive ? "g" : "gi") : new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), opts.caseSensitive ? "g" : "gi");
  } catch {
    throw badRequest("That regular expression is invalid.");
  }
  const files = await db.projectFile.findMany({
    where: { projectId, encoding: "utf8", ...(opts.paths?.length ? { path: { in: opts.paths } } : {}) },
    select: { path: true, content: true },
  });
  let changedFiles = 0;
  let replacements = 0;
  for (const f of files) {
    const count = (f.content.match(re) ?? []).length;
    if (!count) continue;
    const next = opts.regex ? f.content.replace(re, replacement) : f.content.replace(re, () => replacement);
    await writeFile(projectId, f.path, next, ctx);
    changedFiles++;
    replacements += count;
  }
  return { changedFiles, replacements };
}

/** Restores a file to the state *before* a given revision. */
export async function revertRevision(projectId: string, revisionId: string, ctx: ChangeContext) {
  const rev = await db.fileRevision.findFirst({ where: { id: revisionId, projectId } });
  if (!rev) throw notFound("Revision not found.");
  await undoRevision(projectId, rev, ctx);
  await db.fileRevision.update({ where: { id: rev.id }, data: { revertedAt: new Date() } });
}

async function undoRevision(projectId: string, rev: { operation: string; path: string; previousPath: string | null; previousContent: string | null; encoding: string }, ctx: ChangeContext) {
  const enc = rev.encoding === "base64" ? "base64" : "utf8";
  const current = await db.projectFile.findUnique({ where: { projectId_path: { projectId, path: rev.path } } });
  if (rev.operation === "CREATE") {
    if (current) await deleteFile(projectId, rev.path, ctx);
  } else if (rev.operation === "UPDATE") {
    await writeFile(projectId, rev.path, rev.previousContent ?? "", ctx, enc);
  } else if (rev.operation === "DELETE") {
    await writeFile(projectId, rev.path, rev.previousContent ?? "", ctx, enc);
  } else if (rev.operation === "RENAME" && rev.previousPath) {
    if (current) await renamePath(projectId, rev.path, rev.previousPath, ctx);
  }
}

/** Reverts every change an agent task made, newest first. */
export async function revertAgentTask(projectId: string, taskId: string, ctx: ChangeContext) {
  const revisions = await db.fileRevision.findMany({ where: { projectId, agentTaskId: taskId, revertedAt: null }, orderBy: { createdAt: "desc" } });
  for (const rev of revisions) {
    await undoRevision(projectId, rev, ctx);
  }
  await db.fileRevision.updateMany({ where: { id: { in: revisions.map((r) => r.id) } }, data: { revertedAt: new Date() } });
  return revisions.length;
}

/** Replaces a project's files with a new set (used by Git import), recording revisions. */
export async function replaceAllFiles(projectId: string, files: { path: string; content: string; encoding: "utf8" | "base64" }[], ctx: ChangeContext) {
  const incoming = new Map(files.map((f) => [requirePath(f.path), f]));
  const existing = await listFiles(projectId);
  for (const e of existing) if (!incoming.has(e.path)) await deleteFile(projectId, e.path, ctx);
  let written = 0;
  for (const [path, f] of incoming) {
    const size = f.encoding === "base64" ? Buffer.byteLength(f.content, "base64") : Buffer.byteLength(f.content);
    if (size > MAX_FILE_BYTES) continue;
    if (await writeFile(projectId, path, f.content, ctx, f.encoding)) written++;
  }
  return written;
}
