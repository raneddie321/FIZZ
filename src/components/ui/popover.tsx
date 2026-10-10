"use client";
import * as React from "react";
import { Popover as P } from "radix-ui";
import { cn } from "@/lib/utils";

export const Popover = P.Root;
export const PopoverTrigger = P.Trigger;
export const PopoverClose = P.Close;

export function PopoverContent({ className, sideOffset = 6, align = "start", ...props }: React.ComponentProps<typeof P.Content>) {
  return (
    <P.Portal>
      <P.Content
        sideOffset={sideOffset}
        align={align}
        className={cn("z-50 w-72 rounded-lg border border-border bg-popover p-3 text-foreground shadow-lg outline-none data-[state=open]:animate-fade-in", className)}
        {...props}
      />
    </P.Portal>
  );
}
