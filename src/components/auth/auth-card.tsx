import Link from "next/link";
import { FizzMark } from "@/components/brand";

export function AuthCard({ title, subtitle, children, footer }: { title: string; subtitle?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card px-6 py-8 shadow-sm sm:px-9 sm:py-10">
        <div className="mb-7 space-y-4">
          <Link href="/" className="inline-flex items-center gap-2" aria-label="FIZZ home">
            <FizzMark className="size-7" />
            <span className="text-[13px] font-semibold tracking-[0.14em] text-muted-foreground">RANEDDIE ID</span>
          </Link>
          <div className="space-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            {subtitle && <p className="text-[15px] text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
        {children}
      </div>
      {footer && <div className="text-center text-sm text-muted-foreground">{footer}</div>}
    </div>
  );
}
