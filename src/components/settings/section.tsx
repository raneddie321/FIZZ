import { cn } from "@/lib/utils";

export function SettingsSection({
  title,
  description,
  children,
  footer,
  className,
  danger,
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  danger?: boolean;
}) {
  return (
    <section className={cn("rounded-xl border bg-card", danger ? "border-destructive/30" : "border-border", className)}>
      <div className="space-y-1 px-5 pb-2 pt-5 sm:px-6">
        <h2 className={cn("text-[15px] font-semibold", danger && "text-destructive")}>{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="px-5 pb-5 pt-3 sm:px-6">{children}</div>
      {footer && <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3 sm:px-6">{footer}</div>}
    </section>
  );
}

export function SettingsRow({ label, description, children }: { label: string; description?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-b border-border py-4 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-0.5">
        <p className="text-sm font-medium">{label}</p>
        {description && <p className="text-[13px] text-muted-foreground">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
