"use client";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/label";
import { PasswordInput } from "@/components/auth/password-input";
import { apiFetch } from "@/lib/api-client";

export function ChangePasswordForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={formRef}
      className="grid gap-4 sm:max-w-md"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        if (form.get("next") !== form.get("confirm")) {
          setError("The new passwords don't match.");
          return;
        }
        setLoading(true);
        setError(null);
        try {
          await apiFetch("/api/account/password", { method: "POST", body: { current: form.get("current"), next: form.get("next") } });
          toast.success("Password changed. Other sessions were signed out.");
          formRef.current?.reset();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Could not change password");
        } finally {
          setLoading(false);
        }
      }}
    >
      <Field label="Current password" htmlFor="current">
        <PasswordInput id="current" name="current" autoComplete="current-password" required />
      </Field>
      <Field label="New password" htmlFor="next" hint="At least 10 characters, with letters and numbers.">
        <PasswordInput id="next" name="next" autoComplete="new-password" required minLength={10} />
      </Field>
      <Field label="Confirm new password" htmlFor="confirm" error={error}>
        <PasswordInput id="confirm" name="confirm" autoComplete="new-password" required />
      </Field>
      <div>
        <Button type="submit" loading={loading}>
          Update password
        </Button>
      </div>
    </form>
  );
}
