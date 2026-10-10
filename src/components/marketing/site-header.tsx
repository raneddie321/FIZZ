import Link from "next/link";
import { FizzWordmark } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { getAuth } from "@/server/auth/session";
import { MobileNav } from "./mobile-nav";

export const MARKETING_NAV = [
  { href: "/product/fizz", label: "FIZZ" },
  { href: "/product/fizz-dev", label: "FIZZ DEV" },
  { href: "/pricing", label: "Pricing" },
  { href: "/faq", label: "FAQ" },
  { href: "/contact", label: "Support" },
];

export async function SiteHeader() {
  const auth = await getAuth();
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Link href="/" className="shrink-0 rounded-md" aria-label="FIZZ home">
          <FizzWordmark />
        </Link>
        <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
          {MARKETING_NAV.map((item) => (
            <Link key={item.href} href={item.href} className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {auth ? (
            <Button asChild size="sm">
              <Link href="/chat">Open FIZZ</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
                <Link href="/signin">Sign in</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/signup">Get started</Link>
              </Button>
            </>
          )}
          <MobileNav items={MARKETING_NAV} signedIn={Boolean(auth)} />
        </div>
      </div>
    </header>
  );
}
