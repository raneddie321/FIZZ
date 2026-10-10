import "server-only";
import OpenAI from "openai";
import { env } from "../env";
import { ProviderError, type ChatMessage, type ChatProvider, type ChatRequest, type ChatResult } from "./types";

let client: OpenAI | null = null;

export function openaiClient(): OpenAI {
  if (!client) {
    const e = env();
    client = new OpenAI({ apiKey: e.OPENAI_API_KEY, baseURL: e.OPENAI_BASE_URL, timeout: e.AI_REQUEST_TIMEOUT_MS, maxRetries: 2 });
  }
  return client;
}

export function toOpenAIMessages(system: string, messages: ChatMessage[]): OpenAI.Chat.ChatCompletionMessageParam[] {
  const out: OpenAI.Chat.ChatCompletionMessageParam[] = [{ role: "system", content: system }];
  for (const m of messages) {
    if (m.role === "assistant") {
      out.push({ role: "assistant", content: m.content.map((p) => (p.type === "text" ? p.text : "")).join("") });
      continue;
    }
    const parts: OpenAI.Chat.ChatCompletionContentPart[] = [];
    for (const p of m.content) {
      if (p.type === "text") parts.push({ type: "text", text: p.text });
      else if (p.type === "image") parts.push({ type: "image_url", image_url: { url: `data:${p.mediaType};base64,${p.data}` } });
      else parts.push({ type: "file", file: { filename: p.name, file_data: `data:application/pdf;base64,${p.data}` } });
    }
    out.push({ role: "user", content: parts });
  }
  return out;
}

export function mapOpenAIError(error: unknown): ProviderError {
  if (error instanceof OpenAI.AuthenticationError || error instanceof OpenAI.PermissionDeniedError) {
    return new ProviderError("The AI provider rejected FIZZ's credentials. An administrator needs to check the OpenAI API key.", "auth", false);
  }
  if (error instanceof OpenAI.RateLimitError) return new ProviderError("The AI provider is rate limiting requests right now. Please try again shortly.", "rate_limit", true);
  if (error instanceof OpenAI.BadRequestError) return new ProviderError(`The AI provider couldn't process this request: ${error.message.slice(0, 300)}`, "bad_request", false);
  if (error instanceof OpenAI.InternalServerError) return new ProviderError("The AI provider is temporarily unavailable. Please try again.", "overloaded", true);
  if (error instanceof OpenAI.APIConnectionError) return new ProviderError("FIZZ couldn't reach the AI provider. Please try again.", "unavailable", true);
  if (error instanceof OpenAI.APIError) return new ProviderError(`AI provider error (${error.status ?? "unknown"}).`, "unknown", true);
  return new ProviderError(error instanceof Error ? error.message : "Unknown AI provider error.", "unknown", false);
}

export const openaiProvider: ChatProvider = {
  id: "openai",
  label: "OpenAI",
  supportsWebSearch: false,
  configured: () => Boolean(env().OPENAI_API_KEY),

  async streamChat(req: ChatRequest): Promise<ChatResult> {
    let text = "";
    let inputTokens = 0;
    let outputTokens = 0;
    let finish: string | null = null;
    let servedModel = req.model;
    try {
      const stream = await openaiClient().chat.completions.create(
        {
          model: req.model,
          messages: toOpenAIMessages(req.system, req.messages),
          max_completion_tokens: req.maxTokens,
          stream: true,
          stream_options: { include_usage: true },
        },
        { signal: req.signal },
      );
      for await (const chunk of stream) {
        servedModel = chunk.model || servedModel;
        const choice = chunk.choices[0];
        const delta = choice?.delta?.content;
        if (delta) {
          text += delta;
          req.onText?.(delta);
        }
        if (choice?.finish_reason) finish = choice.finish_reason;
        if (chunk.usage) {
          inputTokens = chunk.usage.prompt_tokens;
          outputTokens = chunk.usage.completion_tokens;
        }
      }
      return {
        text,
        stopReason: finish === "length" ? "max_tokens" : finish === "content_filter" ? "refusal" : "end",
        inputTokens,
        outputTokens,
        servedModel,
        sources: [],
      };
    } catch (error) {
      if (req.signal?.aborted || error instanceof OpenAI.APIUserAbortError) {
        return { text, stopReason: "aborted", inputTokens, outputTokens, servedModel, sources: [] };
      }
      throw mapOpenAIError(error);
    }
  },

  async complete({ model, system, prompt, maxTokens, signal }) {
    try {
      const res = await openaiClient().chat.completions.create(
        { model, max_completion_tokens: maxTokens, messages: [{ role: "system", content: system }, { role: "user", content: prompt }] },
        { signal },
      );
      return res.choices[0]?.message?.content ?? "";
    } catch (error) {
      throw mapOpenAIError(error);
    }
  },

  async listModels() {
    const out: { id: string; displayName: string }[] = [];
    for await (const m of openaiClient().models.list()) out.push({ id: m.id, displayName: m.id });
    return out;
  },
};
