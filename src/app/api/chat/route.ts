import { z } from "zod";
import { route, parseJson, badRequest, notFound, forbidden } from "@/server/http";
import { requireApiAuth } from "@/server/auth/session";
import { enforceRateLimit, LIMITS } from "@/server/ratelimit";
import { db } from "@/server/db";
import { resolveModel } from "@/server/ai/models";
import { assertDailyQuota, recordUsage } from "@/server/usage";
import { streamAssistantReply } from "@/server/chat/generate";
import { flagEnabled } from "@/server/flags";

export const maxDuration = 800;

const body = z.object({
  mode: z.enum(["send", "regenerate", "edit"]).default("send"),
  conversationId: z.string().max(40).nullish(),
  content: z.string().max(100_000).default(""),
  attachmentIds: z.array(z.string().max(40)).max(10).default([]),
  model: z.string().max(100).nullish(),
  webSearch: z.boolean().default(false),
  /** For "edit": the user message being replaced. */
  messageId: z.string().max(40).optional(),
});

export const POST = route(async (req) => {
  const { user } = await requireApiAuth();
  enforceRateLimit(`chat:${user.id}`, LIMITS.chat.limit, LIMITS.chat.windowMs, "You're sending messages very quickly. Please wait a moment.");
  const input = await parseJson(req, body);
  const prefs = ((user.preferences ?? {}) as { ai?: { defaultModel?: string | null } }).ai ?? {};
  const model = await resolveModel(user.id, input.model, prefs.defaultModel);
  await assertDailyQuota(user.id, "messagesPerDay");
  const webSearch = input.webSearch && (await flagEnabled("chat.web_search", true));
  if (webSearch) await assertDailyQuota(user.id, "webSearchesPerDay");

  let conversation = input.conversationId ? await db.conversation.findFirst({ where: { id: input.conversationId, userId: user.id } }) : null;
  if (input.conversationId && !conversation) throw notFound("Conversation not found.");

  let userMessageId: string;

  if (input.mode === "send") {
    if (!input.content.trim() && input.attachmentIds.length === 0) throw badRequest("Write a message or attach a file.");
    if (input.attachmentIds.length) {
      const owned = await db.attachment.count({ where: { id: { in: input.attachmentIds }, userId: user.id, messageId: null } });
      if (owned !== input.attachmentIds.length) throw forbidden("One or more attachments are unavailable.");
    }
    if (!conversation) conversation = await db.conversation.create({ data: { userId: user.id, model: model.id } });
    const msg = await db.message.create({ data: { conversationId: conversation.id, role: "USER", content: input.content.trim() } });
    if (input.attachmentIds.length) {
      await db.attachment.updateMany({ where: { id: { in: input.attachmentIds }, userId: user.id }, data: { messageId: msg.id, conversationId: conversation.id } });
    }
    userMessageId = msg.id;
  } else {
    if (!conversation) throw badRequest("A conversation is required.");
    const messages = await db.message.findMany({ where: { conversationId: conversation.id }, orderBy: { createdAt: "asc" } });
    if (input.mode === "regenerate") {
      const lastUserIdx = messages.map((m) => m.role).lastIndexOf("USER");
      if (lastUserIdx === -1) throw badRequest("There is nothing to regenerate.");
      const toDelete = messages.slice(lastUserIdx + 1).map((m) => m.id);
      if (toDelete.length) await db.message.deleteMany({ where: { id: { in: toDelete } } });
      userMessageId = messages[lastUserIdx]!.id;
    } else {
      const idx = messages.findIndex((m) => m.id === input.messageId && m.role === "USER");
      if (idx === -1) throw notFound("Message not found.");
      if (!input.content.trim()) throw badRequest("The edited message can't be empty.");
      await db.message.update({ where: { id: messages[idx]!.id }, data: { content: input.content.trim() } });
      const toDelete = messages.slice(idx + 1).map((m) => m.id);
      if (toDelete.length) {
        await db.attachment.updateMany({ where: { messageId: { in: toDelete } }, data: { messageId: null } });
        await db.message.deleteMany({ where: { id: { in: toDelete } } });
      }
      userMessageId = messages[idx]!.id;
    }
  }

  await db.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: new Date() } });
  await recordUsage({ userId: user.id, kind: "CHAT_MESSAGE", provider: model.provider, model: model.id });
  return streamAssistantReply({ user, conversation, model, webSearch, userMessageId });
});
