"use client";
import { useState } from "react";
import { AlertCircle, Check, Copy, Download, FileText, Globe, Pencil, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { Spinner } from "@/components/ui/misc";
import { FizzMark } from "@/components/brand";
import { cn, formatBytes } from "@/lib/utils";
import { Markdown } from "./markdown";
import type { ChatAttachment, UIMessage } from "./types";

function time(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function Attachments({ items, large }: { items: ChatAttachment[]; large?: boolean }) {
  if (!items.length) return null;
  return (
    <div className={cn("flex flex-wrap gap-2", large ? "" : "justify-end")}>
      {items.map((a) =>
        a.kind === "IMAGE" ? (
          <a key={a.id} href={a.url} target="_blank" rel="noreferrer" className="group relative block overflow-hidden rounded-xl border border-border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={a.url} alt={a.fileName} className={cn("object-cover", large ? "max-h-[420px] w-auto max-w-full" : "h-28 w-28")} loading="lazy" />
            {large && (
              <span className="absolute right-2 top-2 rounded-md bg-black/50 p-1.5 text-white opacity-0 transition-opacity group-hover:opacity-100">
                <Download className="size-4" />
              </span>
            )}
          </a>
        ) : (
          <a key={a.id} href={a.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-xs hover:bg-accent">
            <FileText className="size-4 text-primary" />
            <span className="max-w-40 truncate font-medium">{a.fileName}</span>
            <span className="text-muted-foreground">{formatBytes(a.size)}</span>
          </a>
        ),
      )}
    </div>
  );
}

export function MessageItem({
  message,
  isLast,
  busy,
  onRegenerate,
  onEdit,
  modelName,
}: {
  message: UIMessage;
  isLast: boolean;
  busy: boolean;
  onRegenerate?: () => void;
  onEdit?: (content: string) => void;
  modelName?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);

  const copy = () => {
    void navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (message.role === "USER") {
    return (
      <div className="group flex flex-col items-end gap-1.5 animate-slide-up">
        <Attachments items={message.attachments} />
        {editing ? (
          <div className="w-full max-w-[85%] rounded-2xl border border-ring/50 bg-background p-2">
            <textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={Math.min(10, Math.max(2, draft.split("\n").length))}
              className="w-full resize-none bg-transparent px-2 py-1 text-[15px] outline-none"
              aria-label="Edit message"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (draft.trim()) {
                    setEditing(false);
                    onEdit?.(draft);
                  }
                }
                if (e.key === "Escape") setEditing(false);
              }}
            />
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={!draft.trim()}
                onClick={() => {
                  setEditing(false);
                  onEdit?.(draft);
                }}
              >
                Send
              </Button>
            </div>
          </div>
        ) : (
          message.content && (
            <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-primary-soft px-4 py-2.5 text-[15px] leading-relaxed text-foreground">
              {message.content}
            </div>
          )
        )}
        {!editing && (
          <div className="flex items-center gap-0.5 text-xs text-muted-foreground opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
            <time dateTime={message.createdAt} title={new Date(message.createdAt).toLocaleString()} className="px-1.5">
              {time(message.createdAt)}
            </time>
            <Tooltip content={copied ? "Copied" : "Copy"}>
              <Button variant="subtle" size="icon-xs" onClick={copy} aria-label="Copy message">
                {copied ? <Check /> : <Copy />}
              </Button>
            </Tooltip>
            {onEdit && !message.ephemeral && message.metadata?.kind !== "image_request" && (
              <Tooltip content="Edit">
                <Button
                  variant="subtle"
                  size="icon-xs"
                  disabled={busy}
                  onClick={() => {
                    setDraft(message.content);
                    setEditing(true);
                  }}
                  aria-label="Edit message"
                >
                  <Pencil />
                </Button>
              </Tooltip>
            )}
          </div>
        )}
      </div>
    );
  }

  const streaming = message.status === "STREAMING";
  const sources = message.metadata?.sources ?? [];
  const searches = message.metadata?.searches ?? [];
  const isImage = message.metadata?.kind === "generated_image";

  return (
    <div className="group flex gap-3 animate-fade-in">
      <FizzMark className="mt-0.5 size-7 shrink-0" />
      <div className="min-w-0 flex-1 space-y-2">
        {searches.length > 0 && (
          <p className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
            <Globe className="size-3.5" /> Searched the web for “{searches[searches.length - 1]}”
            {searches.length > 1 ? ` and ${searches.length - 1} more` : ""}
          </p>
        )}
        {streaming && !message.content && (
          <div className="flex h-7 items-center gap-2 text-sm text-muted-foreground">
            <Spinner className="text-primary" />
            {message.thinking ? "Thinking…" : isImage ? "Creating image…" : null}
          </div>
        )}
        {message.content && <Markdown content={message.content} />}
        {isImage && <Attachments items={message.attachments} large />}
        {!isImage && message.attachments.length > 0 && <Attachments items={message.attachments} large />}
        {sources.length > 0 && !streaming && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {sources.slice(0, 8).map((s, i) => (
              <a
                key={s.url}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="flex max-w-60 items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                title={s.url}
              >
                <span className="font-mono text-[10px]">{i + 1}</span>
                <span className="truncate">{s.title || new URL(s.url).hostname}</span>
              </a>
            ))}
          </div>
        )}
        {message.status === "STOPPED" && <p className="text-xs text-muted-foreground">Stopped</p>}
        {message.status === "ERROR" || (message.error && message.status === "COMPLETE") ? (
          <div
            className={cn(
              "flex items-start gap-2 rounded-lg border px-3 py-2 text-sm",
              message.status === "ERROR" ? "border-destructive/30 bg-destructive-soft" : "border-warning/30 bg-warning-soft",
            )}
            role="alert"
          >
            <AlertCircle className={cn("mt-0.5 size-4 shrink-0", message.status === "ERROR" ? "text-destructive" : "text-warning")} />
            <span className="flex-1">{message.error ?? "Something went wrong."}</span>
            {isLast && onRegenerate && message.status === "ERROR" && !busy && (
              <Button size="sm" variant="outline" onClick={onRegenerate} className="h-7">
                <RefreshCw /> Retry
              </Button>
            )}
          </div>
        ) : null}
        {!streaming && (
          <div className="flex items-center gap-0.5 text-xs text-muted-foreground opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
            {message.content && (
              <Tooltip content={copied ? "Copied" : "Copy"}>
                <Button variant="subtle" size="icon-xs" onClick={copy} aria-label="Copy response">
                  {copied ? <Check /> : <Copy />}
                </Button>
              </Tooltip>
            )}
            {isLast && onRegenerate && !isImage && (
              <Tooltip content="Regenerate">
                <Button variant="subtle" size="icon-xs" onClick={onRegenerate} disabled={busy} aria-label="Regenerate response">
                  <RefreshCw />
                </Button>
              </Tooltip>
            )}
            <time dateTime={message.createdAt} title={new Date(message.createdAt).toLocaleString()} className="px-1.5">
              {time(message.createdAt)}
            </time>
            {modelName && <span className="px-1">· {modelName}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
