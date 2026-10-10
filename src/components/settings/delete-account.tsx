"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Alert } from "@/components/ui/misc";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { PasswordInput } from "@/components/auth/password-input";
import { apiFetch } from "@/lib/api-client";

export function DeleteAccount({ requiresPassword }: { requiresPassword: boolean }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive">Delete account</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete your RANEDDIE ID?</DialogTitle>
          <DialogDescription>All FIZZ and FIZZ DEV data will be deleted. Active paid subscriptions should be cancelled first.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setLoading(true);
            setError(null);
            try {
              const res = await apiFetch<{ redirect: string }>("/api/account/delete", {
                method: "POST",
                body: { confirm, password: new FormData(e.currentTarget).get("password") ?? undefined },
              });
              window.location.assign(res.redirect);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Could not delete account");
              setLoading(false);
            }
          }}
        >
          {error && <Alert variant="error">{error}</Alert>}
          <Field label='Type "DELETE" to confirm' htmlFor="confirm-delete">
            <Input id="confirm-delete" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
          </Field>
          {requiresPassword && (
            <Field label="Password" htmlFor="delete-password">
              <PasswordInput id="delete-password" name="password" required autoComplete="current-password" />
            </Field>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={confirm !== "DELETE"} loading={loading}>
              Permanently delete
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
