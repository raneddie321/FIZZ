import { cn } from "@/lib/utils";

export function Section({ className, children, id }: { className?: string; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className={cn("mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24", className)}>
      {children}
    </section>
  );
}

export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("text-[13px] font-medium uppercase tracking-[0.12em] text-primary", className)}>{children}</p>;
}

export function SectionHeading({ eyebrow, title, description, center }: { eyebrow?: string; title: string; description?: string; center?: boolean }) {
  return (
    <div className={cn("max-w-2xl space-y-3", center && "mx-auto text-center")}>
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <h2 className="text-balance text-3xl font-semibold tracking-tight md:text-[2.4rem] md:leading-[1.15]">{title}</h2>
      {description && <p className="text-pretty text-[17px] leading-relaxed text-muted-foreground">{description}</p>}
    </div>
  );
}

export function FeatureGrid({ items }: { items: { icon: React.ComponentType<{ className?: string }>; title: string; description: string; tag?: string }[] }) {
  return (
    <div className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
      {items.map((f) => (
        <div key={f.title} className="space-y-2.5 bg-background p-6">
          <div className="flex items-center gap-2">
            <f.icon className="size-5 text-primary" />
            {f.tag && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{f.tag}</span>}
          </div>
          <h3 className="font-medium">{f.title}</h3>
          <p className="text-sm leading-relaxed text-muted-foreground">{f.description}</p>
        </div>
      ))}
    </div>
  );
}
