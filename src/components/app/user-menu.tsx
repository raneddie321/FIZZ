"use client";
import Link from "next/link";
import { useTheme } from "next-themes";
import {
  Bell,
  CreditCard,
  Gauge,
  LifeBuoy,
  LogOut,
  Monitor,
  Moon,
  Settings,
  Shield,
  Sun,
  Wallet,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { isStaffRole, useUser } from "./user-context";

export function UserMenu({ compact, side = "bottom", className }: { compact?: boolean; side?: "top" | "bottom" | "right"; className?: string }) {
  const user = useUser();
  const { theme, setTheme } = useTheme();

  async function signOut() {
    try {
      const res = await apiFetch<{ redirect: string }>("/api/auth/logout", { method: "POST" });
      window.location.assign(res.redirect);
    } catch {
      window.location.assign("/");
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex min-w-0 items-center gap-2.5 rounded-lg p-1.5 text-left outline-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring",
          className,
        )}
        aria-label="Account menu"
      >
        <Avatar name={user.displayName} src={user.avatarUrl} />
        {!compact && (
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{user.displayName}</span>
            <span className="block truncate text-xs text-muted-foreground">{user.planName} plan</span>
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent side={side} align="start" className="w-64">
        <DropdownMenuLabel className="space-y-0.5">
          <span className="block text-sm font-medium text-foreground">{user.displayName}</span>
          <span className="block truncate font-normal">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings /> Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/wallet">
            <Wallet /> FIZZ Wallet
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/billing">
            <CreditCard /> Billing & plan
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/usage">
            <Gauge /> Usage
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/notifications">
            <Bell /> Notifications
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/support">
            <LifeBuoy /> Help & support
          </Link>
        </DropdownMenuItem>
        {isStaffRole(user.role) && (
          <DropdownMenuItem asChild>
            <Link href="/admin">
              <Shield /> Administration
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <div className="flex items-center justify-between px-2 py-1.5">
          <span className="text-sm">Theme</span>
          <div className="flex rounded-md border border-border p-0.5" role="radiogroup" aria-label="Theme">
            {[
              { value: "light", icon: Sun, label: "Light" },
              { value: "dark", icon: Moon, label: "Dark" },
              { value: "system", icon: Monitor, label: "System" },
            ].map((t) => (
              <button
                key={t.value}
                role="radio"
                aria-checked={theme === t.value}
                aria-label={t.label}
                onClick={() => setTheme(t.value)}
                className={cn("rounded p-1 text-muted-foreground hover:text-foreground", theme === t.value && "bg-accent text-foreground")}
              >
                <t.icon className="size-3.5" />
              </button>
            ))}
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={signOut}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
