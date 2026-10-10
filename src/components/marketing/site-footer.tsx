import Link from "next/link";
import { FizzWordmark, RaneddieLogo } from "@/components/brand";

const COLUMNS = [
  { title: "Products", links: [{ href: "/product/fizz", label: "FIZZ" }, { href: "/product/fizz-dev", label: "FIZZ DEV" }, { href: "/pricing", label: "Pricing" }] },
  { title: "Resources", links: [{ href: "/product", label: "Overview" }, { href: "/faq", label: "FAQ" }, { href: "/contact", label: "Contact support" }] },
  { title: "Legal", links: [{ href: "/terms", label: "Terms of Service" }, { href: "/privacy", label: "Privacy Policy" }] },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="space-y-3">
          <FizzWordmark />
          <p className="max-w-xs text-sm text-muted-foreground">AI assistance for everyday work, and an AI workspace for building software.</p>
        </div>
        {COLUMNS.map((col) => (
          <div key={col.title} className="space-y-3">
            <p className="text-sm font-medium">{col.title}</p>
            <ul className="space-y-2">
              {col.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm text-muted-foreground hover:text-foreground">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-3 px-4 py-6 text-[13px] text-muted-foreground sm:flex-row sm:items-center sm:px-6">
          <div className="flex items-center gap-3">
            <RaneddieLogo />
            <span>© {new Date().getFullYear()} RANEDDIE. All rights reserved.</span>
          </div>
          <span>FIZZ and FIZZ DEV are products of RANEDDIE.</span>
        </div>
      </div>
    </footer>
  );
}
