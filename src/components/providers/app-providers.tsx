"use client";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <TooltipProvider>
        {children}
        <Toaster position="bottom-right" toastOptions={{ classNames: { toast: "!bg-popover !text-foreground !border-border" } }} />
      </TooltipProvider>
    </ThemeProvider>
  );
}
