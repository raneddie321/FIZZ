import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-medium whitespace-nowrap", {
  variants: {
    variant: {
      neutral: "bg-muted text-muted-foreground",
      primary: "bg-primary-soft text-primary",
      dev: "bg-dev-soft text-dev",
      success: "bg-success-soft text-success",
      warning: "bg-warning-soft text-warning",
      destructive: "bg-destructive-soft text-destructive",
      outline: "border border-border text-muted-foreground",
    },
  },
  defaultVariants: { variant: "neutral" },
});

export function Badge({ className, variant, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
