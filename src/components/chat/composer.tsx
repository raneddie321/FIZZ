"use client";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowUp, FileText, Globe, ImagePlus, Loader2, Paperclip, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { cn, formatBytes } from "@/lib/utils";
import { ApiClientError } from "@/lib/api-client";
import { ModelPicker } from "./model-picker";
import type { Capabilities, ChatAttachment } from "./types";

type Pending = { localId: string; file: File; status: "uploading" | "ready" | "error"; attachment?: ChatAttachment; error?: string; preview?: string };

export type ComposerHandle = { setText: (t: string) => void; focus: () => void };

export const Composer = forwardRef<
  ComposerHandle,
  {
    capabilities: Capabilities | null;
    model: string | null;
    onModelChange: (id: string) => void;
    streaming: boolean;
    disabled?: boolean;
    onSend: (text: string, attachments: ChatAttachment[], opts: { webSearch: boolean; image: boolean }) => Promise<boolean>;
    onStop: () => void;
  }
>(function Composer({ capabilities, model, onModelChange, streaming, disabled, onSend, onStop }, ref) {
  const [text, setText] = useState("");
  const [pending, setPending] = useState<Pending[]>([]);
  const [webSearch, setWebSearch] = useState(false);
  const [imageMode, setImageMode] = useState(false);
  const [dragging, setDragging] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const currentModel = capabilities?.models.find((m) => m.id === model);
  const canSearch = Boolean(currentModel?.webSearch);
  const canImage = Boolean(capabilities?.imageGeneration.enabled);

  useImperativeHandle(ref, () => ({ setText: (t) => setText(t), focus: () => textareaRef.current?.focus() }));

  useEffect(() => {
    if (capabilities?.webSearchByDefault) setWebSearch(true);
  }, [capabilities?.webSearchByDefault]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 280)}px`;
  }, [text]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (e.key === "/" && !typing) {
        e.preventDefault();
        textareaRef.current?.focus();
      }
      if (e.key === "Escape" && streaming) onStop();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [streaming, onStop]);

  const upload = useCallback(
    async (files: File[]) => {
      if (imageMode) setImageMode(false);
      const max = (capabilities?.maxUploadMb ?? 10) * 1024 * 1024;
      for (const file of files.slice(0, 10)) {
        const localId = crypto.randomUUID();
        if (file.size > max) {
          toast.error(`"${file.name}" is larger than your ${capabilities?.maxUploadMb ?? 10} MB upload limit.`);
          continue;
        }
        const preview = file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined;
        setPending((p) => [...p, { localId, file, status: "uploading", preview }]);
        const form = new FormData();
        form.append("file", file);
        try {
          const res = await fetch("/api/uploads", { method: "POST", body: form });
          const data = await res.json().catch(() => null);
          if (!res.ok) throw new ApiClientError(data?.error?.message ?? "Upload failed", res.status);
          setPending((p) => p.map((x) => (x.localId === localId ? { ...x, status: "ready", attachment: data.attachment } : x)));
        } catch (err) {
          const message = err instanceof Error ? err.message : "Upload failed";
          toast.error(message);
          setPending((p) => p.map((x) => (x.localId === localId ? { ...x, status: "error", error: message } : x)));
        }
      }
    },
    [capabilities?.maxUploadMb, imageMode],
  );

  const removePending = (p: Pending) => {
    setPending((list) => list.filter((x) => x.localId !== p.localId));
    if (p.preview) URL.revokeObjectURL(p.preview);
    if (p.attachment) void fetch(`/api/attachments/${p.attachment.id}`, { method: "DELETE" }).catch(() => undefined);
  };

  const uploading = pending.some((p) => p.status === "uploading");
  const ready = pending.filter((p) => p.status === "ready" && p.attachment).map((p) => p.attachment!);
  const canSend = !disabled && !streaming && !uploading && (text.trim().length > 0 || (ready.length > 0 && !imageMode));

  async function submit() {
    if (!canSend) return;
    const sent = text;
    const atts = ready;
    setText("");
    setPending([]);
    const ok = await onSend(sent, atts, { webSearch: webSearch && canSearch, image: imageMode });
    if (!ok) {
      setText(sent);
    }
    textareaRef.current?.focus();
  }

  return (
    <div
      className="relative"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (e.dataTransfer.files.length) void upload([...e.dataTransfer.files]);
      }}
    >
      <div
        className={cn(
          "rounded-2xl border border-input bg-background shadow-sm transition-colors focus-within:border-ring/60",
          dragging && "border-primary bg-primary-soft",
          imageMode && "border-primary/50",
        )}
      >
        {pending.length > 0 && (
          <div className="flex flex-wrap gap-2 px-3 pt-3">
            {pending.map((p) => (
              <div
                key={p.localId}
                className={cn("group relative flex h-14 max-w-56 items-center gap-2 rounded-xl border border-border bg-surface pr-7 text-xs", p.status === "error" && "border-destructive/40")}
              >
                {p.preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.preview} alt="" className="h-full w-14 rounded-l-xl object-cover" />
                ) : (
                  <span className="ml-2 flex size-9 items-center justify-center rounded-lg bg-primary-soft text-primary">
                    <FileText className="size-4" />
                  </span>
                )}
                <div className={cn("min-w-0", p.preview ? "" : "pr-1")}>
                  <p className="truncate font-medium">{p.file.name}</p>
                  <p className="text-muted-foreground">{p.status === "uploading" ? "Uploading…" : p.status === "error" ? "Failed" : formatBytes(p.file.size)}</p>
                </div>
                {p.status === "uploading" && <Loader2 className="absolute right-2 top-2 size-3.5 animate-spin text-muted-foreground" />}
                {p.status !== "uploading" && (
                  <button onClick={() => removePending(p)} className="absolute right-1.5 top-1.5 rounded-full p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label={`Remove ${p.file.name}`}>
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void submit();
            }
          }}
          onPaste={(e) => {
            const files = [...e.clipboardData.files];
            if (files.length) {
              e.preventDefault();
              void upload(files);
            }
          }}
          rows={1}
          placeholder={imageMode ? "Describe the image you want to create…" : "Message FIZZ"}
          aria-label="Message"
          disabled={disabled}
          className="block max-h-[280px] w-full resize-none bg-transparent px-4 pb-2 pt-3.5 text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground disabled:opacity-60"
        />
        <div className="flex items-center gap-1 px-2 pb-2">
          <input
            ref={fileRef}
            type="file"
            multiple
            hidden
            accept="image/png,image/jpeg,image/gif,image/webp,application/pdf,.txt,.md,.csv,.json,.xml,.html,.css,.js,.ts,.tsx,.jsx,.py,.java,.c,.cpp,.go,.rs,.rb,.php,.sh,.yaml,.yml,.toml,.sql,.log"
            onChange={(e) => {
              if (e.target.files) void upload([...e.target.files]);
              e.target.value = "";
            }}
          />
          <Tooltip content="Attach files">
            <Button variant="ghost" size="icon-sm" onClick={() => fileRef.current?.click()} aria-label="Attach files" disabled={disabled || imageMode}>
              <Paperclip />
            </Button>
          </Tooltip>
          <Tooltip content={canSearch ? (webSearch ? "Web search on" : "Search the web") : "Web search isn't available for this model"}>
            <Button
              variant="ghost"
              size="sm"
              aria-pressed={webSearch && canSearch}
              disabled={!canSearch || imageMode}
              onClick={() => setWebSearch((v) => !v)}
              className={cn("gap-1.5 px-2 text-muted-foreground", webSearch && canSearch && "bg-primary-soft text-primary hover:bg-primary-soft")}
            >
              <Globe /> <span className="hidden sm:inline">Search</span>
            </Button>
          </Tooltip>
          {canImage && (
            <Tooltip content={capabilities?.imageGeneration.configured ? "Create an image" : "Image generation needs an image provider to be configured"}>
              <Button
                variant="ghost"
                size="sm"
                aria-pressed={imageMode}
                disabled={!capabilities?.imageGeneration.configured}
                title={capabilities?.imageGeneration.configured ? undefined : "Image generation isn't configured"}
                onClick={() => setImageMode((v) => !v)}
                className={cn("gap-1.5 px-2 text-muted-foreground", imageMode && "bg-primary-soft text-primary hover:bg-primary-soft")}
              >
                <ImagePlus /> <span className="hidden sm:inline">Image</span>
              </Button>
            </Tooltip>
          )}
          <div className="ml-auto flex items-center gap-1">
            {!imageMode && capabilities && <ModelPicker models={capabilities.models} value={model} onChange={onModelChange} />}
            {streaming ? (
              <Tooltip content="Stop generating" shortcut="Esc">
                <Button size="icon-sm" onClick={onStop} aria-label="Stop generating" className="rounded-full">
                  <Square className="size-3.5 fill-current" />
                </Button>
              </Tooltip>
            ) : (
              <Tooltip content="Send" shortcut="Enter">
                <Button size="icon-sm" onClick={() => void submit()} disabled={!canSend} aria-label="Send message" className="rounded-full">
                  <ArrowUp />
                </Button>
              </Tooltip>
            )}
          </div>
        </div>
      </div>
      {dragging && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl text-sm font-medium text-primary">Drop files to attach</div>
      )}
    </div>
  );
});
