import { cn } from "@/lib/utils";

/**
 * RANEDDIE company logo.
 * The official logo has not been supplied yet, so this renders a neutral
 * typographic placeholder. Drop the official file into /public/brand and set
 * NEXT_PUBLIC_RANEDDIE_LOGO_SRC (e.g. "/brand/raneddie-logo.svg") to use it.
 */
export function RaneddieLogo({ className }: { className?: string }) {
  const src = process.env.NEXT_PUBLIC_RANEDDIE_LOGO_SRC;
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="RANEDDIE" className={cn("h-4 w-auto", className)} />;
  }
  return (
    <span className={cn("select-none text-[11px] font-semibold tracking-[0.22em] text-muted-foreground", className)} aria-label="RANEDDIE">
      RANEDDIE
    </span>
  );
}

/** FIZZ product mark: three rising bubbles. */
export function FizzMark({ className, product = "fizz" }: { className?: string; product?: "fizz" | "dev" }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("size-6", className)} aria-hidden>
      <rect width="24" height="24" rx="6.5" className={product === "dev" ? "fill-dev" : "fill-primary"} />
      <circle cx="8.4" cy="15.6" r="3.6" fill="white" />
      <circle cx="14.9" cy="9.6" r="2.5" fill="white" fillOpacity="0.9" />
      <circle cx="18.6" cy="5.3" r="1.45" fill="white" fillOpacity="0.8" />
    </svg>
  );
}

export function FizzWordmark({ className, product = "fizz", showMark = true }: { className?: string; product?: "fizz" | "dev"; showMark?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      {showMark && <FizzMark product={product} />}
      <span className="text-[17px] font-semibold tracking-tight text-foreground">FIZZ</span>
      {product === "dev" && (
        <span className="rounded-[5px] bg-dev-soft px-1.5 py-0.5 font-mono text-[10.5px] font-semibold tracking-wider text-dev">DEV</span>
      )}
    </span>
  );
}
