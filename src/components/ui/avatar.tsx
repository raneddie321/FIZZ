import { cn, initials } from "@/lib/utils";

export function Avatar({ name, src, className }: { name: string; src?: string | null; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex size-8 shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-primary-soft text-[12px] font-semibold text-primary",
        className,
      )}
      aria-hidden
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="size-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        initials(name) || "?"
      )}
    </span>
  );
}
