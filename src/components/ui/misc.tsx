import * as React from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export function Separator({ className, vertical }: { className?: string; vertical?: boolean }) {
  return <div role="separator" className={cn(vertical ? "w-px self-stretch" : "h-px w-full", "bg-border", className)} />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} />;
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1", className)} role="status" aria-label="Loading">
      <span className="size-1.5 rounded-full bg-current animate-pulse-dot" />
      <span className="size-1.5 rounded-full bg-current animate-pulse-dot [animation-delay:150ms]" />
      <span className="size-1.5 rounded-full bg-current animate-pulse-dot [animation-delay:300ms]" />
    </span>
  );
}

const ALERT = {
  info: { icon: Info, cls: "border-primary/25 bg-primary-soft text-foreground [&_svg]:text-primary" },
  success: { icon: CheckCircle2, cls: "border-success/25 bg-success-soft text-foreground [&_svg]:text-success" },
  warning: { icon: AlertTriangle, cls: "border-warning/30 bg-warning-soft text-foreground [&_svg]:text-warning" },
  error: { icon: XCircle, cls: "border-destructive/30 bg-destructive-soft text-foreground [&_svg]:text-destructive" },
};

export function Alert({
  variant = "info",
  title,
  children,
  className,
  action,
}: {
  variant?: keyof typeof ALERT;
  title?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}) {
  const { icon: Icon, cls } = ALERT[variant];
  return (
    <div role={variant === "error" ? "alert" : "status"} className={cn("flex gap-3 rounded-lg border px-4 py-3 text-sm", cls, className)}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1 space-y-1">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className="text-muted-foreground [&_a]:text-primary [&_a]:underline">{children}</div>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 px-6 py-14 text-center", className)}>
      {Icon && (
        <div className="flex size-11 items-center justify-center rounded-xl border border-border bg-surface">
          <Icon className="size-5 text-muted-foreground" />
        </div>
      )}
      <div className="space-y-1">
        <p className="font-medium">{title}</p>
        {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return <kbd className={cn("rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground", className)}>{children}</kbd>;
}
