"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Archive, ArchiveRestore, MoreHorizontal, PanelLeftClose, Pencil, Search, SquarePen, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/misc";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FizzWordmark } from "@/components/brand";
import { ProductSwitcher } from "@/components/app/product-switcher";
import { UserMenu } from "@/components/app/user-menu";
import { apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { CONVERSATIONS_CHANGED } from "./events";

type Conv = { id: string; title: string; lastMessageAt: string; archivedAt: string | null };

function groupLabel(date: Date) {
  const now = new Date();
  const days = Math.floor((new Date(now.toDateString()).getTime() - new Date(date.toDateString()).getTime()) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return "Previous 7 days";
  if (days < 30) return "Previous 30 days";
  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export function ChatSidebar({ onNavigate, onCollapse }: { onNavigate?: () => void; onCollapse?: () => void }) {
  const router = useRouter();
  const params = useParams<{ id?: string }>();
  const [items, setItems] = useState<Conv[] | null>(null);
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Conv | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const qs = new URLSearchParams();
    if (query.trim()) qs.set("q", query.trim());
    if (showArchived) qs.set("archived", "1");
    try {
      const res = await apiFetch<{ conversations: Conv[] }>(`/api/conversations?${qs}`);
      setItems(res.conversations);
    } catch {
      setItems((prev) => prev ?? []);
    }
  }, [query, showArchived]);

  useEffect(() => {
    const t = setTimeout(load, query ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, query]);

  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent<{ id?: string; title?: string }>).detail;
      if (d?.id && d.title) setItems((prev) => prev?.map((c) => (c.id === d.id ? { ...c, title: d.title! } : c)) ?? prev);
      void load();
    };
    window.addEventListener(CONVERSATIONS_CHANGED, handler);
    const keys = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", keys);
    return () => {
      window.removeEventListener(CONVERSATIONS_CHANGED, handler);
      window.removeEventListener("keydown", keys);
    };
  }, [load]);

  const groups = useMemo(() => {
    const map = new Map<string, Conv[]>();
    for (const c of items ?? []) {
      const label = groupLabel(new Date(c.lastMessageAt));
      map.set(label, [...(map.get(label) ?? []), c]);
    }
    return [...map.entries()];
  }, [items]);

  async function rename(id: string, title: string) {
    setRenaming(null);
    if (!title.trim()) return;
    try {
      await apiFetch(`/api/conversations/${id}`, { method: "PATCH", body: { title } });
      setItems((prev) => prev?.map((c) => (c.id === id ? { ...c, title } : c)) ?? prev);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not rename");
    }
  }

  async function archive(c: Conv, archived: boolean) {
    try {
      await apiFetch(`/api/conversations/${c.id}`, { method: "PATCH", body: { archived } });
      setItems((prev) => prev?.filter((x) => x.id !== c.id) ?? prev);
      toast.success(archived ? "Conversation archived" : "Conversation restored");
      if (params.id === c.id && archived) router.push("/chat");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update");
    }
  }

  async function remove(c: Conv) {
    try {
      await apiFetch(`/api/conversations/${c.id}`, { method: "DELETE" });
      setItems((prev) => prev?.filter((x) => x.id !== c.id) ?? prev);
      setDeleting(null);
      toast.success("Conversation deleted");
      if (params.id === c.id) router.push("/chat");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete");
    }
  }

  return (
    <div className="flex h-full flex-col bg-surface">
      <div className="flex h-14 items-center justify-between gap-2 px-3">
        <Link href="/chat" onClick={onNavigate} className="rounded-md">
          <FizzWordmark />
        </Link>
        <div className="flex items-center">
          {onCollapse && (
            <Tooltip content="Close sidebar">
              <Button variant="ghost" size="icon-sm" onClick={onCollapse} aria-label="Close sidebar">
                <PanelLeftClose />
              </Button>
            </Tooltip>
          )}
          <Tooltip content="New chat" shortcut="Ctrl Shift O">
            <Button variant="ghost" size="icon-sm" asChild>
              <Link href="/chat" onClick={onNavigate} aria-label="New chat">
                <SquarePen />
              </Link>
            </Button>
          </Tooltip>
        </div>
      </div>
      <div className="space-y-2 px-3 pb-2">
        <ProductSwitcher className="w-full [&>a]:flex-1 [&>a]:text-center" />
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats"
            aria-label="Search conversations"
            className="h-9 bg-background pl-8 pr-8"
          />
          {query && (
            <button onClick={() => setQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" aria-label="Clear search">
              <X className="size-4" />
            </button>
          )}
        </div>
      </div>
      <nav className="thin-scroll flex-1 overflow-y-auto px-2 pb-2" aria-label="Conversations">
        {items === null ? (
          <div className="space-y-2 p-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-7" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            {query ? "No conversations match your search." : showArchived ? "No archived conversations." : "Your conversations will appear here."}
          </p>
        ) : (
          groups.map(([label, convs]) => (
            <div key={label} className="mb-3">
              <p className="px-2.5 pb-1 pt-2 text-xs font-medium text-muted-foreground">{label}</p>
              {convs.map((c) => (
                <div
                  key={c.id}
                  className={cn("group relative flex items-center rounded-lg text-sm hover:bg-accent", params.id === c.id && "bg-accent font-medium")}
                >
                  {renaming === c.id ? (
                    <input
                      autoFocus
                      defaultValue={c.title}
                      maxLength={120}
                      className="m-1 h-7 w-full rounded-md border border-ring bg-background px-2 text-sm outline-none"
                      onBlur={(e) => rename(c.id, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") rename(c.id, e.currentTarget.value);
                        if (e.key === "Escape") setRenaming(null);
                      }}
                      aria-label="Conversation title"
                    />
                  ) : (
                    <Link href={`/chat/${c.id}`} onClick={onNavigate} className="min-w-0 flex-1 truncate px-2.5 py-2 pr-8" title={c.title}>
                      {c.title}
                    </Link>
                  )}
                  {renaming !== c.id && (
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        className="absolute right-1 rounded-md p-1 text-muted-foreground opacity-0 hover:bg-background hover:text-foreground focus:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100"
                        aria-label={`Options for ${c.title}`}
                      >
                        <MoreHorizontal className="size-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem onSelect={() => setRenaming(c.id)}>
                          <Pencil /> Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => archive(c, !c.archivedAt)}>
                          {c.archivedAt ? <ArchiveRestore /> : <Archive />} {c.archivedAt ? "Unarchive" : "Archive"}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem destructive onSelect={() => setDeleting(c)}>
                          <Trash2 /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              ))}
            </div>
          ))
        )}
      </nav>
      <div className="space-y-1 border-t border-border p-2">
        <button
          onClick={() => setShowArchived((v) => !v)}
          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Archive className="size-4" /> {showArchived ? "Back to chats" : "Archived chats"}
        </button>
        <UserMenu side="top" className="w-full" />
      </div>
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete conversation?"
        description={`"${deleting?.title}" and its attachments will be permanently deleted.`}
        confirmLabel="Delete"
        destructive
        onConfirm={() => (deleting ? remove(deleting) : undefined)}
      />
    </div>
  );
}
