import { z } from "zod";
import { route, json, notFound, parseJson } from "@/server/http";
import { requireApiAuth } from "@/server/auth/session";
import { db } from "@/server/db";
import { storage } from "@/server/storage";
import { publicAttachment } from "@/server/uploads";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (_req, { params }) => {
  const { id } = await params;
  const { user } = await requireApiAuth();
  const conversation = await db.conversation.findFirst({
    where: { id, userId: user.id },
    include: { messages: { orderBy: { createdAt: "asc" }, include: { attachments: true } } },
  });
  if (!conversation) throw notFound("Conversation not found.");
  return json({
    conversation: {
      id: conversation.id,
      title: conversation.title,
      model: conversation.model,
      archivedAt: conversation.archivedAt,
      messages: conversation.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        status: m.status,
        error: m.error,
        model: m.model,
        metadata: m.metadata,
        createdAt: m.createdAt,
        attachments: m.attachments.map(publicAttachment),
      })),
    },
  });
});

const patch = z.object({ title: z.string().trim().min(1).max(120).optional(), archived: z.boolean().optional() });

export const PATCH = route<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const { user } = await requireApiAuth();
  const input = await parseJson(req, patch);
  const res = await db.conversation.updateMany({
    where: { id, userId: user.id },
    data: {
      ...(input.title ? { title: input.title, titleLocked: true } : {}),
      ...(input.archived !== undefined ? { archivedAt: input.archived ? new Date() : null } : {}),
    },
  });
  if (!res.count) throw notFound("Conversation not found.");
  return json({ ok: true });
});

export const DELETE = route<Ctx>(async (_req, { params }) => {
  const { id } = await params;
  const { user } = await requireApiAuth();
  const conv = await db.conversation.findFirst({ where: { id, userId: user.id }, include: { attachments: { select: { id: true, storageKey: true } } } });
  if (!conv) throw notFound("Conversation not found.");
  await db.attachment.deleteMany({ where: { conversationId: id, userId: user.id } });
  await db.conversation.delete({ where: { id } });
  for (const a of conv.attachments) await storage().delete(a.storageKey).catch(() => undefined);
  return json({ ok: true });
});
