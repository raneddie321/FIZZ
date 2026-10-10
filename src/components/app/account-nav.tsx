"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, CreditCard, Database, Gauge, KeyRound, LifeBuoy, Link2, MonitorSmartphone, Palette, Sparkles, User, Wallet, BellRing } from "lucide-react";
import { cn } from "@/lib/utils";

const GROUPS = [
  {
    title: "Account",
    items: [
      { href: "/settings", label: "Profile", icon: User },
      { href: "/settings/security", label: "Password & security", icon: KeyRound },
      { href: "/settings/sessions", label: "Devices & sessions", icon: MonitorSmartphone },
      { href: "/settings/appearance", label: "Appearance & language", icon: Palette },
      { href: "/settings/notifications", label: "Notification preferences", icon: BellRing },
      { href: "/settings/ai", label: "AI preferences", icon: Sparkles },
      { href: "/settings/connections", label: "Connected services", icon: Link2 },
      { href: "/settings/data", label: "Data & privacy", icon: Database },
    ],
  },
  {
    title: "Plan & payments",
    items: [
      { href: "/billing", label: "Billing & subscription", icon: CreditCard },
      { href: "/wallet", label: "FIZZ Wallet", icon: Wallet },
      { href: "/usage", label: "Usage", icon: Gauge },
    ],
  },
  {
    title: "More",
    items: [
      { href: "/notifications", label: "Notifications", icon: Bell },
      { href: "/support", label: "Help & support", icon: LifeBuoy },
    ],
  },
];

export function AccountNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Account" className="space-y-6">
      {GROUPS.map((g) => (
        <div key={g.title} className="space-y-1">
          <p className="px-3 pb-1 text-xs font-medium text-muted-foreground">{g.title}</p>
          {g.items.map((item) => {
            const active = item.href === "/settings" ? pathname === "/settings" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                  active && "bg-accent font-medium text-foreground",
                )}
              >
                <item.icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

export function AccountNavMobile() {
  const pathname = usePathname();
  const items = GROUPS.flatMap((g) => g.items);
  return (
    <nav aria-label="Account" className="thin-scroll -mx-4 flex gap-1 overflow-x-auto px-4 pb-1 lg:hidden">
      {items.map((item) => {
        const active = item.href === "/settings" ? pathname === "/settings" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn("shrink-0 rounded-full border border-border px-3 py-1.5 text-[13px] text-muted-foreground", active && "border-primary/40 bg-primary-soft text-primary")}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
