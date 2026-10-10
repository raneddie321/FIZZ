"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function ProductSwitcher({ className }: { className?: string }) {
  const pathname = usePathname();
  const dev = pathname.startsWith("/dev");
  return (
    <nav className={cn("inline-flex rounded-lg border border-border bg-surface p-0.5 text-[13px]", className)} aria-label="Switch product">
      <Link
        href="/chat"
        aria-current={!dev ? "page" : undefined}
        className={cn("rounded-md px-2.5 py-1 font-medium text-muted-foreground transition-colors hover:text-foreground", !dev && "bg-background text-foreground shadow-sm")}
      >
        FIZZ
      </Link>
      <Link
        href="/dev"
        aria-current={dev ? "page" : undefined}
        className={cn("rounded-md px-2.5 py-1 font-medium text-muted-foreground transition-colors hover:text-foreground", dev && "bg-background text-dev shadow-sm")}
      >
        FIZZ DEV
      </Link>
    </nav>
  );
}
