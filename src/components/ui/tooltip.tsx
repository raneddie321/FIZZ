"use client";
import * as React from "react";
import { Tooltip as T } from "radix-ui";
import { cn } from "@/lib/utils";

export const TooltipProvider = T.Provider;

export function Tooltip({
  content,
  children,
  side = "top",
  shortcut,
}: {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  shortcut?: string;
}) {
  return (
    <T.Root delayDuration={250}>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content
          side={side}
          sideOffset={6}
          className={cn("z-50 flex items-center gap-2 rounded-md bg-foreground px-2 py-1 text-xs text-background shadow-md data-[state=delayed-open]:animate-fade-in")}
        >
          {content}
          {shortcut && <kbd className="rounded border border-background/20 px-1 font-mono text-[10px] opacity-70">{shortcut}</kbd>}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}
