"use client";
import { Check, ChevronDown, Lock } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { ModelOption } from "./types";

export function ModelPicker({ models, value, onChange }: { models: ModelOption[]; value: string | null; onChange: (id: string) => void }) {
  const current = models.find((m) => m.id === value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex h-8 items-center gap-1 rounded-lg px-2.5 text-[13px] font-medium text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring data-[state=open]:bg-accent"
        aria-label="Choose model"
      >
        <span className="max-w-40 truncate">{current?.name ?? "Choose a model"}</span>
        <ChevronDown className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-80">
        <DropdownMenuLabel>Model</DropdownMenuLabel>
        {models.length === 0 && <p className="px-2 py-2 text-sm text-muted-foreground">No models are enabled.</p>}
        {models.map((m) => (
          <DropdownMenuItem key={m.id} disabled={!m.available} onSelect={() => onChange(m.id)} className="items-start py-2">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                {m.name}
                {!m.available && <Lock className="size-3" />}
              </p>
              <p className="text-xs text-muted-foreground">{m.available ? m.description : m.reason}</p>
            </div>
            <Check className={cn("mt-0.5 size-4", m.id === value ? "opacity-100" : "opacity-0")} />
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <p className="px-2 py-1.5 text-[11.5px] text-muted-foreground">Availability depends on your plan and the providers connected to FIZZ.</p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
