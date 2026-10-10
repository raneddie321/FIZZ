"use client";
import * as React from "react";
import { AlertDialog as A } from "radix-ui";
import { Button } from "./button";

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  destructive,
  loading,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void | Promise<void>;
  children?: React.ReactNode;
}) {
  return (
    <A.Root open={open} onOpenChange={onOpenChange}>
      <A.Portal>
        <A.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-fade-in" />
        <A.Content className="fixed left-1/2 top-1/2 z-50 grid w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl border border-border bg-popover p-6 shadow-xl data-[state=open]:animate-slide-up">
          <div className="space-y-1.5">
            <A.Title className="text-lg font-semibold">{title}</A.Title>
            {description && <A.Description className="text-sm text-muted-foreground">{description}</A.Description>}
          </div>
          {children}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <A.Cancel asChild>
              <Button variant="outline">Cancel</Button>
            </A.Cancel>
            <Button
              variant={destructive ? "destructive" : "primary"}
              loading={loading}
              onClick={(e) => {
                e.preventDefault();
                void onConfirm();
              }}
            >
              {confirmLabel}
            </Button>
          </div>
        </A.Content>
      </A.Portal>
    </A.Root>
  );
}
