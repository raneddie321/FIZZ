"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { PasswordInput } from "@/components/auth/password-input";
import { apiFetch } from "@/lib/api-client";

export function ChangeEmailDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Change email
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change email address</DialogTitle>
          <DialogDescription>We&apos;ll send a confirmation link to the new address. Your email won&apos;t change until you open it.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            setLoading(true);
            try {
              const res = await apiFetch<{ status: string }>("/api/account/email", { method: "POST", body: { email: form.get("email"), password: form.get("password") } });
              toast.success(res.status === "SENT" ? "Confirmation email sent" : res.status === "LOGGED" ? "Confirmation link recorded in the development mailbox" : "We couldn't send the email");
              setOpen(false);
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Could not start email change");
            } finally {
              setLoading(false);
            }
          }}
        >
          <Field label="New email" htmlFor="new-email">
            <Input id="new-email" name="email" type="email" required autoComplete="email" />
          </Field>
          <Field label="Current password" htmlFor="email-password">
            <PasswordInput id="email-password" name="password" required autoComplete="current-password" />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={loading}>
              Send confirmation
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
