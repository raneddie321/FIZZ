"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, Code2, Lightbulb, PenLine, Search as SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, Skeleton } from "@/components/ui/misc";
import { useUser } from "@/components/app/user-context";
import { apiFetch, ApiClientError } from "@/lib/api-client";
import { readSSE } from "@/lib/sse-client";
import { Composer, type ComposerHandle } from "./composer";
import { MessageItem } from "./message";
import { notifyConversationsChanged } from "./events";
import type { Capabilities, ChatAttachment, ChatSource, UIMessage } from "./types";

const SUGGESTIONS = [
  { icon: PenLine, title: "Help me write", prompt: "Help me write a friendly email to my team announcing a new project kickoff next Monday." },
  { icon: Lightbulb, title: "Brainstorm ideas", prompt: "Brainstorm 10 creative names for a mobile game about exploring underwater cities." },
  { icon: Code2, title: "Explain code", prompt: "Explain the difference between useEffect and useLayoutEffect in React, with examples." },
  { icon: SearchIcon, title: "Summarize a topic", prompt: "Give me a concise overview of how HTTPS keeps web traffic secure." },
];

type ConversationResponse = { conversation: { id: string; title: string; model: string | null; messages: UIMessage[] } };

export function ChatView({ conversationId: initialId }: { conversationId: string | null }) {
  const user = useUser();
  const [conversationId, setConversationId] = useState<string | null>(initialId);
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [loading, setLoading] = useState(Boolean(initialId));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<ComposerHandle>(null);
  const abortRef = useRef<AbortController | null>(null);
  const convModelRef = useRef<string | null>(null);

  // Capabilities (models, search, image generation)
  useEffect(() => {
    apiFetch<Capabilities>("/api/chat/capabilities")
      .then((caps) => {
        setCapabilities(caps);
        setModel((current) => {
          if (current) return current;
          const pick = [convModelRef.current, caps.preferredModel, caps.models.find((m) => m.isDefault)?.id].find((id) => id && caps.models.some((m) => m.id === id && m.available));
          return pick ?? caps.models.find((m) => m.available)?.id ?? null;
        });
      })
      .catch(() => toast.error("Could not load available models"));
  }, []);

  const loadConversation = useCallback(async (id: string, quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const res = await apiFetch<ConversationResponse>(`/api/conversations/${id}`);
      setMessages(res.conversation.messages);
      convModelRef.current = res.conversation.model;
      if (res.conversation.model) setModel((m) => m ?? res.conversation.model);
      document.title = `${res.conversation.title} · FIZZ`;
      setLoadError(null);
      return res.conversation;
    } catch (err) {
      setLoadError(err instanceof ApiClientError && err.status === 404 ? "This conversation doesn't exist or was deleted." : "Could not load this conversation.");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialId) void loadConversation(initialId);
  }, [initialId, loadConversation]);

  // If a reply is still being generated in the background (e.g. after a reload), poll until it finishes.
  const backgroundStreaming = !streamingId && messages.some((m) => m.status === "STREAMING");
  useEffect(() => {
    if (!backgroundStreaming || !conversationId) return;
    const t = setInterval(() => void loadConversation(conversationId, true), 2000);
    return () => clearInterval(t);
  }, [backgroundStreaming, conversationId, loadConversation]);

  // Auto-scroll while near the bottom.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && atBottom) el.scrollTop = el.scrollHeight;
  }, [messages, atBottom]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
  };

  const patchMessage = (id: string, fn: (m: UIMessage) => UIMessage) => setMessages((list) => list.map((m) => (m.id === id ? fn(m) : m)));

  const runStream = useCallback(
    async (body: Record<string, unknown>, tempUserId: string | null, tempAssistantId: string): Promise<boolean> => {
      const controller = new AbortController();
      abortRef.current = controller;
      setStreamingId(tempAssistantId);
      let assistantId = tempAssistantId;
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new ApiClientError(data?.error?.message ?? `Request failed (${res.status})`, res.status, data?.error?.code);
        }
        await readSSE(
          res,
          ({ event, data }) => {
            const d = data as Record<string, unknown>;
            if (event === "meta") {
              const realAssistant = d.assistantMessageId as string;
              const realUser = d.userMessageId as string;
              const convId = d.conversationId as string;
              setMessages((list) =>
                list.map((m) =>
                  m.id === tempAssistantId ? { ...m, id: realAssistant, model: d.model as string } : tempUserId && m.id === tempUserId ? { ...m, id: realUser } : m,
                ),
              );
              assistantId = realAssistant;
              setStreamingId(realAssistant);
              if (!conversationId || conversationId !== convId) {
                setConversationId(convId);
                window.history.replaceState(null, "", `/chat/${convId}`);
                notifyConversationsChanged({ id: convId });
              }
            } else if (event === "text") {
              patchMessage(assistantId, (m) => ({ ...m, content: m.content + (d.delta as string), thinking: false }));
            } else if (event === "thinking") {
              patchMessage(assistantId, (m) => ({ ...m, thinking: true }));
            } else if (event === "search") {
              patchMessage(assistantId, (m) => ({ ...m, metadata: { ...m.metadata, searches: [...(m.metadata?.searches ?? []), d.query as string] } }));
            } else if (event === "sources") {
              patchMessage(assistantId, (m) => ({ ...m, metadata: { ...m.metadata, sources: d.sources as ChatSource[] } }));
            } else if (event === "done") {
              patchMessage(assistantId, (m) => ({ ...m, status: d.status as UIMessage["status"], error: (d.error as string | null) ?? null, model: (d.servedModel as string) ?? m.model }));
            } else if (event === "error") {
              patchMessage(assistantId, (m) => ({ ...m, status: "ERROR", error: d.message as string, retryable: Boolean(d.retryable) }));
            } else if (event === "title") {
              document.title = `${d.title as string} · FIZZ`;
              notifyConversationsChanged({ id: conversationId ?? undefined, title: d.title as string });
            }
          },
          controller.signal,
        );
        // If the stream dropped before a terminal event, the message stays STREAMING and the
        // background poll below picks up whatever the server saved.
        return true;
      } catch (err) {
        if ((err as Error).name === "AbortError") return true;
        const message = err instanceof Error ? err.message : "Something went wrong.";
        if (assistantId === tempAssistantId) {
          // The server rejected the request before saving anything.
          setMessages((list) =>
            list
              .filter((m) => m.id !== tempUserId)
              .map((m) => (m.id === tempAssistantId ? { ...m, status: "ERROR", error: message, ephemeral: true } : m)),
          );
          if (tempUserId) return false;
        } else {
          patchMessage(assistantId, (m) => ({ ...m, status: "ERROR", error: message }));
        }
        return true;
      } finally {
        abortRef.current = null;
        setStreamingId(null);
        notifyConversationsChanged();
      }
    },
    [conversationId],
  );

  const send = useCallback(
    async (text: string, attachments: ChatAttachment[], opts: { webSearch: boolean; image: boolean }) => {
      const now = new Date().toISOString();
      const tempUser: UIMessage = { id: `tmp-u-${crypto.randomUUID()}`, role: "USER", content: text.trim(), status: "COMPLETE", createdAt: now, attachments };
      const tempAssistant: UIMessage = {
        id: `tmp-a-${crypto.randomUUID()}`,
        role: "ASSISTANT",
        content: "",
        status: "STREAMING",
        createdAt: now,
        attachments: [],
        metadata: opts.image ? { kind: "generated_image" } : undefined,
      };
      setMessages((list) => [...list.filter((m) => !m.ephemeral), tempUser, tempAssistant]);
      setAtBottom(true);

      if (opts.image) {
        setStreamingId(tempAssistant.id);
        try {
          const res = await apiFetch<{ conversationId: string }>("/api/images/generate", { method: "POST", body: { prompt: text, conversationId } });
          if (res.conversationId !== conversationId) {
            setConversationId(res.conversationId);
            window.history.replaceState(null, "", `/chat/${res.conversationId}`);
          }
          await loadConversation(res.conversationId, true);
        } catch (err) {
          const message = err instanceof Error ? err.message : "Image generation failed.";
          if (conversationId) await loadConversation(conversationId, true);
          else setMessages((list) => list.map((m) => (m.id === tempAssistant.id ? { ...m, status: "ERROR", error: message, ephemeral: true } : m)));
          toast.error(message);
        } finally {
          setStreamingId(null);
          notifyConversationsChanged();
        }
        return true;
      }

      return runStream(
        { mode: "send", conversationId, content: text, attachmentIds: attachments.map((a) => a.id), model, webSearch: opts.webSearch },
        tempUser.id,
        tempAssistant.id,
      );
    },
    [conversationId, model, runStream, loadConversation],
  );

  const regenerate = useCallback(() => {
    if (!conversationId) return;
    const lastUser = [...messages].reverse().find((m) => m.role === "USER");
    if (!lastUser) return;
    const idx = messages.indexOf(lastUser);
    const temp: UIMessage = { id: `tmp-a-${crypto.randomUUID()}`, role: "ASSISTANT", content: "", status: "STREAMING", createdAt: new Date().toISOString(), attachments: [] };
    setMessages([...messages.slice(0, idx + 1), temp]);
    void runStream({ mode: "regenerate", conversationId, model }, null, temp.id);
  }, [conversationId, messages, model, runStream]);

  const edit = useCallback(
    (messageId: string, content: string) => {
      if (!conversationId) return;
      const idx = messages.findIndex((m) => m.id === messageId);
      if (idx === -1) return;
      const temp: UIMessage = { id: `tmp-a-${crypto.randomUUID()}`, role: "ASSISTANT", content: "", status: "STREAMING", createdAt: new Date().toISOString(), attachments: [] };
      setMessages([...messages.slice(0, idx), { ...messages[idx]!, content }, temp]);
      void runStream({ mode: "edit", conversationId, messageId, content, model }, null, temp.id);
    },
    [conversationId, messages, model, runStream],
  );

  const stop = useCallback(() => {
    const id = streamingId;
    if (id && !id.startsWith("tmp-")) void apiFetch("/api/chat/stop", { method: "POST", body: { messageId: id } }).catch(() => undefined);
    else abortRef.current?.abort();
  }, [streamingId]);

  const modelName = (id?: string | null) => capabilities?.models.find((m) => m.id === id)?.name ?? id ?? undefined;
  const noModels = capabilities && !capabilities.models.some((m) => m.available);
  const empty = !loading && messages.length === 0 && !loadError;
  const busy = Boolean(streamingId) || backgroundStreaming;

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} onScroll={onScroll} className="thin-scroll relative flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-4 pb-6 pt-6 sm:px-6 md:pt-10">
          {loading && (
            <div className="space-y-6">
              <Skeleton className="ml-auto h-10 w-2/3 rounded-2xl" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="ml-auto h-10 w-1/2 rounded-2xl" />
            </div>
          )}
          {loadError && (
            <Alert variant="error" title={loadError} action={<Button asChild size="sm" variant="outline"><Link href="/chat">New chat</Link></Button>} />
          )}
          {empty && (
            <div className="flex min-h-[50vh] flex-col items-center justify-center gap-8 text-center">
              <div className="space-y-2">
                <h1 className="text-balance text-3xl font-semibold tracking-tight">How can I help, {user.displayName.split(" ")[0]}?</h1>
                <p className="text-muted-foreground">Ask a question, share a file, or start with an idea.</p>
              </div>
              <div className="grid w-full gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s.title}
                    onClick={() => {
                      composerRef.current?.setText(s.prompt);
                      composerRef.current?.focus();
                    }}
                    className="flex items-start gap-3 rounded-xl border border-border p-3.5 text-left transition-colors hover:bg-accent"
                  >
                    <s.icon className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span>
                      <span className="block text-sm font-medium">{s.title}</span>
                      <span className="line-clamp-1 text-[13px] text-muted-foreground">{s.prompt}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-7">
            {messages.map((m, i) => (
              <MessageItem
                key={m.id}
                message={m}
                isLast={i === messages.length - 1}
                busy={busy}
                modelName={m.role === "ASSISTANT" ? modelName(m.model) : undefined}
                onRegenerate={m.role === "ASSISTANT" && conversationId && !m.ephemeral ? regenerate : undefined}
                onEdit={m.role === "USER" && conversationId ? (content) => edit(m.id, content) : undefined}
              />
            ))}
          </div>
        </div>
        {!atBottom && messages.length > 0 && (
          <button
            onClick={() => {
              setAtBottom(true);
              scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
            }}
            className="sticky bottom-3 left-1/2 flex size-8 -translate-x-1/2 items-center justify-center rounded-full border border-border bg-background shadow-md hover:bg-accent"
            aria-label="Scroll to latest message"
          >
            <ArrowDown className="size-4" />
          </button>
        )}
      </div>
      <div className="shrink-0 bg-gradient-to-t from-background via-background to-background/0 px-4 pb-4 pt-2 sm:px-6">
        <div className="mx-auto w-full max-w-3xl space-y-2">
          {noModels && (
            <Alert variant="warning" title="AI isn't connected yet">
              No AI model is available right now. {user.role === "USER" ? "Please try again later." : "Add an Anthropic or OpenAI API key and enable a model in Administration → Models."}
            </Alert>
          )}
          <Composer
            ref={composerRef}
            capabilities={capabilities}
            model={model}
            onModelChange={setModel}
            streaming={Boolean(streamingId)}
            disabled={Boolean(noModels) || Boolean(loadError)}
            onSend={send}
            onStop={stop}
          />
          <p className="text-center text-[11.5px] text-muted-foreground">FIZZ can make mistakes. Check important information.</p>
        </div>
      </div>
    </div>
  );
}
