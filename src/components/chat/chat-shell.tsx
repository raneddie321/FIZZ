"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, PanelLeftOpen, SquarePen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { ChatSidebar } from "./chat-sidebar";

export function ChatShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("fizz.chat.sidebar") === "collapsed");
    } catch {}
    const keys = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "o") {
        e.preventDefault();
        router.push("/chat");
      }
    };
    window.addEventListener("keydown", keys);
    return () => window.removeEventListener("keydown", keys);
  }, [router]);

  const setCollapsedPersist = (v: boolean) => {
    setCollapsed(v);
    try {
      localStorage.setItem("fizz.chat.sidebar", v ? "collapsed" : "open");
    } catch {}
  };

  return (
    <div className="flex h-dvh overflow-hidden">
      {!collapsed && (
        <aside className="hidden w-[272px] shrink-0 border-r border-border md:block">
          <ChatSidebar onCollapse={() => setCollapsedPersist(true)} />
        </aside>
      )}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Conversations">
          <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[85%] max-w-[300px] border-r border-border shadow-xl animate-slide-up">
            <ChatSidebar onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-12 shrink-0 items-center gap-1 px-2 md:hidden">
          <Button variant="ghost" size="icon-sm" onClick={() => setMobileOpen(true)} aria-label="Open conversations">
            <Menu />
          </Button>
          <span className="flex-1 text-center text-sm font-semibold">FIZZ</span>
          <Button variant="ghost" size="icon-sm" asChild>
            <Link href="/chat" aria-label="New chat">
              <SquarePen />
            </Link>
          </Button>
        </div>
        {collapsed && (
          <div className="absolute left-2 top-2 z-10 hidden gap-1 md:flex">
            <Tooltip content="Open sidebar" side="right">
              <Button variant="ghost" size="icon-sm" onClick={() => setCollapsedPersist(false)} aria-label="Open sidebar">
                <PanelLeftOpen />
              </Button>
            </Tooltip>
            <Tooltip content="New chat" side="right">
              <Button variant="ghost" size="icon-sm" asChild>
                <Link href="/chat" aria-label="New chat">
                  <SquarePen />
                </Link>
              </Button>
            </Tooltip>
          </div>
        )}
        <main id="main" className="relative min-h-0 flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}
