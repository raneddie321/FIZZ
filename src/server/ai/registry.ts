import "server-only";
import { anthropicProvider } from "./anthropic";
import { openaiProvider } from "./openai";
import type { ChatProvider, ProviderId } from "./types";

export const PROVIDERS: Record<ProviderId, ChatProvider> = {
  anthropic: anthropicProvider,
  openai: openaiProvider,
};

export function getProvider(id: string): ChatProvider | null {
  return (PROVIDERS as Record<string, ChatProvider>)[id] ?? null;
}

export function anyProviderConfigured() {
  return Object.values(PROVIDERS).some((p) => p.configured());
}
