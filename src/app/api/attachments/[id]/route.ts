import { route, json, notFound, badRequest } from "@/server/http";
import { requireApiAuth } from "@/server/auth/session";
import { db } from "@/server/db";
import { storage } from "@/server/storage";

export const GET = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const { id } = await params;
  const { user } = await requireApiAuth();
  const a = await db.attachment.findFirst({ where: { id, userId: user.id } });
  if (!a) throw notFound();
  const data = await storage().get(a.storageKey);
  const inline = a.kind === "IMAGE" || a.mimeType === "application/pdf";
  const download = new URL(req.url).searchParams.has("download");
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": a.kind === "IMAGE" || a.mimeType === "application/pdf" ? a.mimeType : "text/plain; charset=utf-8",
      "Content-Length": String(data.length),
      "Content-Disposition": `${inline && !download ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(a.fileName)}`,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
    },
  });
});

/** Removes an attachment that hasn't been sent in a message yet. */
export const DELETE = route<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  const { id } = await params;
  const { user } = await requireApiAuth();
  const a = await db.attachment.findFirst({ where: { id, userId: user.id } });
  if (!a) throw notFound();
  if (a.messageId) throw badRequest("This file is part of a sent message.");
  await db.attachment.delete({ where: { id } });
  await storage().delete(a.storageKey).catch(() => undefined);
  return json({ ok: true });
});
