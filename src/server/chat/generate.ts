import "server-only";
import type { Conversation } from "@prisma/client";
import { db } from "../db";
import { env } from "../env";
import { createSSE, SSE_HEADERS } from "../sse";
import { getProvider } from "../ai/registry";
import { ProviderError } from "../ai/types";
import type { ModelAvailability } from "../ai/models";
import { recordUsage } from "../usage";
import { logError } from "../errors";
import { buildHistory } from "./context";
import { fizzSystemPrompt, TITLE_SYSTEM_PROMPT } from "./prompts";
import type { SessionUser } from "../auth/session";

type Active = { controller: AbortController; userId: string };
const g = globalThis as unknown as { __fizzActiveGenerations?: Map<string, Active> };
const active = (g.__fizzActiveGenerations ??= new Map<string, Active>());

export function stopGeneration(messageId: string, userId: string): boolean {
  const entry = active.get(messageId);
  if (!entry || entry.userId !== userId) return false;
  entry.controller.abort();
  return true;
}

const DEFAULT_TITLE = "New conversation";

async function generateTitle(conversation: Conversation, model: ModelAvailability, firstUser: string, firstAnswer: string) {
  const provider = getProvider(model.provider);
  if (!provider) return null;
  const anthropicOk = getProvider("anthropic")?.configured();
  const titleModel = env().TITLE_MODEL ?? (anthropicOk ? "claude-haiku-5-5" : model.id);
  const titleProvider = titleModel.startsWith("claude") ? getProvider("anthropic") : provider;
  if (!titleProvider?.configured()) return null;
  try {
    const raw = await titleProvider.complete({
      model: titleModel,
      system: TITLE_SYSTEM_PROMPT,
      prompt: `User: ${firstUser.slice(0, 2000)}\n\nAssistant: ${firstAnswer.slice(0, 1500)}`,
      maxTokens: 2000,
      signal: AbortSignal.timeout(30_000),
    });
    const title = raw.replace(/^["'\s]+|["'\s.]+$/g, "").split("\n")[0]!.slice(0, 80);
    if (!title) return null;
    const updated = await db.conversation.updateMany({ where: { id: conversation.id, titleLocked: false, title: DEFAULT_TITLE }, data: { title } });
    return updated.count ? title : null;
  } catch (error) {
    await logError("chat.title", error, { conversationId: conversation.id });
    return null;
  }
}

export function fallbackTitle(text: string) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return DEFAULT_TITLE;
  return clean.length > 60 ? `${clean.slice(0, 57)}…` : clean;
}

/**
 * Streams an assistant reply for the latest user message in `conversation`.
 * The assistant message row is created up-front (STREAMING) and updated as text arrives,
 * so the conversation survives reloads and client disconnects.
 */
export async function streamAssistantReply(opts: {
  user: SessionUser;
  conversation: Conversation;
  model: ModelAvailability;
  webSearch: boolean;
  userMessageId: string;
}): Promise<Response> {
  const { user, conversation, model } = opts;
  const provider = getProvider(model.provider)!;
  const prefs = ((user.preferences ?? {}) as { ai?: { responseStyle?: string; customInstructions?: string } }).ai ?? {};

  const history = await db.message.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "asc" },
    include: { attachments: true },
  });
  const { messages, omitted } = await buildHistory(history, { vision: model.supportsVision, documents: model.supportsDocuments });
  const webSearch = opts.webSearch && provider.supportsWebSearch && (provider.id !== "anthropic" || env().ANTHROPIC_WEB_SEARCH_ENABLED);

  const assistant = await db.message.create({
    data: { conversationId: conversation.id, role: "ASSISTANT", content: "", status: "STREAMING", model: model.id, provider: provider.id },
  });
  const controller = new AbortController();
  active.set(assistant.id, { controller, userId: user.id });

  const sse = createSSE();
  sse.send("meta", { conversationId: conversation.id, userMessageId: opts.userMessageId, assistantMessageId: assistant.id, model: model.id, modelName: model.displayName });

  const run = async () => {
    let text = "";
    let lastFlush = Date.now();
    const searches: string[] = [];
    try {
      const result = await provider.streamChat({
        model: model.id,
        system: fizzSystemPrompt({
          userName: user.displayName,
          language: user.language,
          responseStyle: prefs.responseStyle,
          customInstructions: prefs.customInstructions,
          modelName: model.displayName,
          webSearch,
          omittedMessages: omitted,
        }),
        messages,
        maxTokens: model.maxOutputTokens,
        signal: controller.signal,
        webSearch,
        effort: "medium",
        onText: (delta) => {
          text += delta;
          sse.send("text", { delta });
          if (Date.now() - lastFlush > 1500) {
            lastFlush = Date.now();
            void db.message.update({ where: { id: assistant.id }, data: { content: text } }).catch(() => undefined);
          }
        },
        onThinking: () => sse.send("thinking", {}),
        onSearch: (q) => {
          searches.push(q);
          sse.send("search", { query: q });
        },
        onSources: (s) => {
          sse.send("sources", { sources: s });
        },
      });

      const status = result.stopReason === "aborted" ? "STOPPED" : result.stopReason === "refusal" && !result.text ? "ERROR" : "COMPLETE";
      const error =
        result.stopReason === "refusal"
          ? "The model declined to continue with this request."
          : result.stopReason === "max_tokens"
            ? "The response reached the maximum length and was cut off."
            : result.stopReason === "context_window"
              ? "The conversation reached the model's context limit."
              : null;
      await db.message.update({
        where: { id: assistant.id },
        data: {
          content: result.text,
          status,
          error,
          model: result.servedModel,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          metadata: JSON.parse(JSON.stringify({ sources: result.sources, searches, stopReason: result.stopReason, refusalCategory: result.refusalCategory ?? null })),
        },
      });
      await db.conversation.update({ where: { id: conversation.id }, data: { lastMessageAt: new Date(), model: model.id } });
      if (result.inputTokens || result.outputTokens) {
        await recordUsage({ userId: user.id, kind: "TOKENS", provider: provider.id, model: result.servedModel, inputTokens: result.inputTokens, outputTokens: result.outputTokens, metadata: { conversationId: conversation.id } });
      }
      if (searches.length) await recordUsage({ userId: user.id, kind: "WEB_SEARCH", quantity: searches.length, provider: provider.id });
      sse.send("done", { status, error, stopReason: result.stopReason, usage: { inputTokens: result.inputTokens, outputTokens: result.outputTokens }, servedModel: result.servedModel });

      if (conversation.title === DEFAULT_TITLE && !conversation.titleLocked && result.text) {
        const firstUser = history.find((m) => m.role === "USER")?.content ?? "";
        const title = (await generateTitle(conversation, model, firstUser, result.text)) ?? null;
        if (!title) {
          const fb = fallbackTitle(firstUser);
          await db.conversation.updateMany({ where: { id: conversation.id, title: DEFAULT_TITLE, titleLocked: false }, data: { title: fb } });
          sse.send("title", { title: fb });
        } else {
          sse.send("title", { title });
        }
      }
    } catch (error) {
      const pe = error instanceof ProviderError ? error : null;
      if (!pe) await logError("chat.generate", error, { conversationId: conversation.id }, user.id);
      const message = pe?.message ?? "Something went wrong while generating a response.";
      await db.message
        .update({ where: { id: assistant.id }, data: { content: text, status: "ERROR", error: message } })
        .catch(() => undefined);
      sse.send("error", { message, code: pe?.kind ?? "unknown", retryable: pe?.retryable ?? true });
    } finally {
      active.delete(assistant.id);
      sse.close();
    }
  };
  void run();

  return new Response(sse.stream, { headers: SSE_HEADERS });
}
