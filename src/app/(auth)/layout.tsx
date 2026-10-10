import Link from "next/link";
import { RaneddieLogo } from "@/components/brand";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-[420px]">{children}</div>
      </main>
      <footer className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 px-4 pb-8 text-[13px] text-muted-foreground">
        <RaneddieLogo />
        <Link href="/terms" className="hover:text-foreground">Terms</Link>
        <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
        <Link href="/contact" className="hover:text-foreground">Help</Link>
      </footer>
    </div>
  );
}
