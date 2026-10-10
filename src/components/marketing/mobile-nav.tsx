"use client";
import Link from "next/link";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function MobileNav({ items, signedIn }: { items: { href: string; label: string }[]; signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="md:hidden">
      <Button variant="ghost" size="icon-sm" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {open ? <X /> : <Menu />}
      </Button>
      {open && (
        <div className="absolute inset-x-0 top-16 border-b border-border bg-background px-4 pb-4 shadow-sm animate-fade-in">
          <nav className="flex flex-col py-2" aria-label="Mobile">
            {items.map((item) => (
              <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className="rounded-md px-2 py-3 text-[15px] hover:bg-accent">
                {item.label}
              </Link>
            ))}
            {!signedIn && (
              <Link href="/signin" onClick={() => setOpen(false)} className="rounded-md px-2 py-3 text-[15px] hover:bg-accent">
                Sign in
              </Link>
            )}
          </nav>
        </div>
      )}
    </div>
  );
}
