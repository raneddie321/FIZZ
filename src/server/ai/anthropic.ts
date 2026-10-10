import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "../env";
import { ProviderError, type ChatMessage, type ChatProvider, type ChatRequest, type ChatResult, type Source } from "./types";

let client: Anthropic | null = null;

export function anthropicClient(): Anthropic {
  if (!client) {
    const e = env();
    client = new Anthropic({
      apiKey: e.ANTHROPIC_API_KEY,
      baseURL: e.ANTHROPIC_BASE_URL_OVERRIDE,
      timeout: e.AI_REQUEST_TIMEOUT_MS,
      maxRetries: 2,
    });
  }
  return client;
}

/** Models that accept `output_config.effort` (Claude 4.6+ generations). */
export function supportsEffort(model: string) {
  return /^claude-(opus|sonnet|haiku|fable|mythos)-(5|4-[6-9])/.test(model);
}

/** Models for which the server-side refusal fallback (`fallbacks: "default"`) is offered. */
export function supportsServerFallback(model: string) {
  return /^claude-(fable-5-1|opus-5-5|opus-5|sonnet-5-5)$/.test(model);
}

export function toAnthropicMessages(messages: ChatMessage[]): Anthropic.Beta.BetaMessageParam[] {
  return messages.map((m) => ({
    role: m.role,
    content: m.content.map((p): Anthropic.Beta.BetaContentBlockParam => {
      if (p.type === "text") return { type: "text", text: p.text };
      if (p.type === "image") {
        return {
          type: "image",
          source: { type: "base64", media_type: p.mediaType as "image/png" | "image/jpeg" | "image/gif" | "image/webp", data: p.data },
        };
      }
      return { type: "document", source: { type: "base64", media_type: "application/pdf", data: p.data }, title: p.name };
    }),
  }));
}

export function mapAnthropicError(error: unknown): ProviderError {
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return new ProviderError("The AI provider rejected FIZZ's credentials. An administrator needs to check the Anthropic API key.", "auth", false);
  }
  if (error instanceof Anthropic.RateLimitError) return new ProviderError("The AI provider is rate limiting requests right now. Please try again shortly.", "rate_limit", true);
  if (error instanceof Anthropic.BadRequestError) {
    const msg = error.message.toLowerCase();
    if (msg.includes("prompt is too long") || msg.includes("context")) return new ProviderError("This conversation is too long for the selected model. Start a new conversation or remove attachments.", "context", false);
    return new ProviderError(`The AI provider couldn't process this request: ${error.message.slice(0, 300)}`, "bad_request", false);
  }
  if (error instanceof Anthropic.InternalServerError) return new ProviderError("The AI provider is temporarily overloaded. Please try again.", "overloaded", true);
  if (error instanceof Anthropic.APIConnectionError) return new ProviderError("FIZZ couldn't reach the AI provider. Please try again.", "unavailable", true);
  if (error instanceof Anthropic.APIError) return new ProviderError(`AI provider error (${error.status ?? "unknown"}).`, "unknown", true);
  return new ProviderError(error instanceof Error ? error.message : "Unknown AI provider error.", "unknown", false);
}

export const anthropicProvider: ChatProvider = {
  id: "anthropic",
  label: "Anthropic",
  supportsWebSearch: true,
  configured: () => Boolean(env().ANTHROPIC_API_KEY),

  async streamChat(req: ChatRequest): Promise<ChatResult> {
    const useFallback = env().ANTHROPIC_REFUSAL_FALLBACK && supportsServerFallback(req.model);
    const tools: Anthropic.Beta.BetaToolUnion[] = req.webSearch ? [{ type: "web_search_20260209", name: "web_search", max_uses: 5 }] : [];
    const sources = new Map<string, Source>();
    let text = "";
    try {
      const stream = anthropicClient().beta.messages.stream(
        {
          model: req.model,
          max_tokens: req.maxTokens,
          system: [{ type: "text", text: req.system }],
          messages: toAnthropicMessages(req.messages),
          ...(tools.length ? { tools } : {}),
          ...(req.effort && supportsEffort(req.model) ? { output_config: { effort: req.effort } } : {}),
          ...(useFallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
        },
        { signal: req.signal },
      );
      for await (const event of stream) {
        if (event.type === "content_block_start") {
          const block = event.content_block;
          if (block.type === "thinking" || block.type === "redacted_thinking") req.onThinking?.();
          if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
            for (const r of block.content) if (r.type === "web_search_result") sources.set(r.url, { url: r.url, title: r.title });
            req.onSources?.([...sources.values()]);
          }
        } else if (event.type === "content_block_delta") {
          if (event.delta.type === "text_delta") {
            text += event.delta.text;
            req.onText?.(event.delta.text);
          }
        }
      }
      const final = await stream.finalMessage();
      for (const block of final.content) {
        if (block.type === "server_tool_use" && block.name === "web_search") {
          const q = (block.input as { query?: string })?.query;
          if (q) req.onSearch?.(q);
        }
      }
      const stop = final.stop_reason;
      return {
        text,
        stopReason: stop === "refusal" ? "refusal" : stop === "max_tokens" ? "max_tokens" : stop === "model_context_window_exceeded" ? "context_window" : "end",
        inputTokens: (final.usage.input_tokens ?? 0) + (final.usage.cache_read_input_tokens ?? 0) + (final.usage.cache_creation_input_tokens ?? 0),
        outputTokens: final.usage.output_tokens ?? 0,
        servedModel: final.model,
        sources: [...sources.values()],
        refusalCategory: stop === "refusal" ? (final.stop_details?.category ?? null) : undefined,
      };
    } catch (error) {
      if (req.signal?.aborted || error instanceof Anthropic.APIUserAbortError) {
        return { text, stopReason: "aborted", inputTokens: 0, outputTokens: 0, servedModel: req.model, sources: [...sources.values()] };
      }
      throw mapAnthropicError(error);
    }
  },

  async complete({ model, system, prompt, maxTokens, signal }) {
    try {
      const res = await anthropicClient().messages.create(
        {
          model,
          max_tokens: maxTokens,
          system,
          messages: [{ role: "user", content: prompt }],
          ...(supportsEffort(model) ? { output_config: { effort: "low" as const } } : {}),
        },
        { signal },
      );
      if (res.stop_reason === "refusal") return "";
      return res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    } catch (error) {
      throw mapAnthropicError(error);
    }
  },

  async listModels() {
    const out: { id: string; displayName: string }[] = [];
    for await (const m of anthropicClient().models.list({ limit: 100 })) out.push({ id: m.id, displayName: m.display_name });
    return out;
  },
};
