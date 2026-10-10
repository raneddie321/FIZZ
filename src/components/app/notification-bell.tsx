"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";

export function NotificationBell() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let active = true;
    const load = () =>
      fetch("/api/notifications?unread=1&countOnly=1")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => active && d && setCount(d.unread ?? 0))
        .catch(() => undefined);
    load();
    const id = setInterval(load, 60_000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);
  return (
    <Tooltip content="Notifications">
      <Button asChild variant="ghost" size="icon-sm" className="relative">
        <Link href="/notifications" aria-label={count ? `Notifications (${count} unread)` : "Notifications"}>
          <Bell />
          {count > 0 && (
            <span className="absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground">
              {count > 9 ? "9+" : count}
            </span>
          )}
        </Link>
      </Button>
    </Tooltip>
  );
}
