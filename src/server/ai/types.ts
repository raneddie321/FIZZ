import "server-only";

export type ProviderId = "anthropic" | "openai";

export type ChatPart =
  | { type: "text"; text: string }
  | { type: "image"; mediaType: string; data: string }
  | { type: "document"; mediaType: "application/pdf"; data: string; name: string };

export type ChatMessage = { role: "user" | "assistant"; content: ChatPart[] };

export type Source = { url: string; title: string };

export type StreamCallbacks = {
  onText?: (delta: string) => void;
  onThinking?: () => void;
  onSearch?: (query: string) => void;
  onSources?: (sources: Source[]) => void;
};

export type StopReason = "end" | "max_tokens" | "refusal" | "aborted" | "context_window";

export type ChatResult = {
  text: string;
  stopReason: StopReason;
  inputTokens: number;
  outputTokens: number;
  servedModel: string;
  sources: Source[];
  refusalCategory?: string | null;
};

export type ChatRequest = {
  model: string;
  system: string;
  messages: ChatMessage[];
  maxTokens: number;
  signal?: AbortSignal;
  webSearch?: boolean;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
} & StreamCallbacks;

export interface ChatProvider {
  id: ProviderId;
  label: string;
  configured(): boolean;
  streamChat(req: ChatRequest): Promise<ChatResult>;
  /** Quick non-streaming completion (titles, small helpers). */
  complete(req: { model: string; system: string; prompt: string; maxTokens: number; signal?: AbortSignal }): Promise<string>;
  listModels(): Promise<{ id: string; displayName: string }[]>;
  supportsWebSearch: boolean;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public kind: "auth" | "rate_limit" | "overloaded" | "bad_request" | "unavailable" | "context" | "unknown",
    public retryable: boolean,
  ) {
    super(message);
  }
}
