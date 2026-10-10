import { z } from "zod";
import { route, json, parseJson, notFound, forbidden } from "@/server/http";
import { requireApiAuth } from "@/server/auth/session";
import { enforceRateLimit } from "@/server/ratelimit";
import { db } from "@/server/db";
import { assertDailyQuota, recordUsage } from "@/server/usage";
import { generateImage } from "@/server/ai/images";
import { detectFile, publicAttachment, storeAttachment } from "@/server/uploads";
import { flagEnabled } from "@/server/flags";
import { fallbackTitle } from "@/server/chat/generate";
import { ProviderError } from "@/server/ai/types";
import { ApiError } from "@/server/http";
import { env } from "@/server/env";

export const maxDuration = 300;

const body = z.object({
  prompt: z.string().trim().min(3, "Describe the image you want.").max(4000),
  conversationId: z.string().max(40).nullish(),
  size: z.enum(["1024x1024", "1536x1024", "1024x1536"]).default("1024x1024"),
});

export const POST = route(async (req) => {
  const { user } = await requireApiAuth();
  if (!(await flagEnabled("chat.image_generation", true))) throw forbidden("Image generation is currently disabled.");
  enforceRateLimit(`image:${user.id}`, 10, 60_000);
  const input = await parseJson(req, body);
  await assertDailyQuota(user.id, "imageGenerationsPerDay");

  let conversation = input.conversationId ? await db.conversation.findFirst({ where: { id: input.conversationId, userId: user.id } }) : null;
  if (input.conversationId && !conversation) throw notFound("Conversation not found.");
  conversation ??= await db.conversation.create({ data: { userId: user.id, title: fallbackTitle(`Image: ${input.prompt}`), titleLocked: false } });

  const userMessage = await db.message.create({
    data: { conversationId: conversation.id, role: "USER", content: input.prompt, metadata: { kind: "image_request", size: input.size } },
  });
  let png: Buffer;
  try {
    png = await generateImage(input.prompt, input.size);
  } catch (error) {
    const message = error instanceof ApiError || error instanceof ProviderError ? error.message : "Image generation failed.";
    await db.message.create({ data: { conversationId: conversation.id, role: "ASSISTANT", content: "", status: "ERROR", error: message, provider: "openai", model: env().OPENAI_IMAGE_MODEL } });
    throw error instanceof ApiError ? error : new ApiError(502, "image_failed", message);
  }
  const attachment = await storeAttachment(user.id, `fizz-image-${Date.now()}.png`, png, detectFile("image.png", "image/png", png), {
    conversationId: conversation.id,
    generated: true,
  });
  const assistant = await db.message.create({
    data: {
      conversationId: conversation.id,
      role: "ASSISTANT",
      content: "",
      provider: "openai",
      model: env().OPENAI_IMAGE_MODEL,
      metadata: { kind: "generated_image", prompt: input.prompt },
      attachments: { connect: { id: attachment.id } },
    },
  });
  await db.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: new Date() } });
  await recordUsage({ userId: user.id, kind: "IMAGE_GENERATION", provider: "openai", model: env().OPENAI_IMAGE_MODEL });
  return json({ conversationId: conversation.id, userMessageId: userMessage.id, assistantMessageId: assistant.id, attachment: publicAttachment(attachment) });
});
