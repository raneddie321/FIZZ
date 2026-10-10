"use client";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/label";
import { Alert } from "@/components/ui/misc";
import { PasswordInput } from "@/components/auth/password-input";
import { apiFetch } from "@/lib/api-client";

export function ResetPasswordForm({ token }: { token: string }) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (done) {
    return (
      <div className="space-y-4">
        <Alert variant="success" title="Password updated">You can now sign in with your new password.</Alert>
        <Button asChild size="lg" className="w-full">
          <Link href="/signin">Sign in</Link>
        </Button>
      </div>
    );
  }
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        if (form.get("password") !== form.get("confirm")) {
          setError("The passwords don't match.");
          return;
        }
        setLoading(true);
        setError(null);
        try {
          await apiFetch("/api/auth/reset-password", { method: "POST", body: { token, password: form.get("password") } });
          setDone(true);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Could not reset password.");
        } finally {
          setLoading(false);
        }
      }}
    >
      {error && <Alert variant="error">{error}</Alert>}
      <Field label="New password" htmlFor="password" hint="At least 10 characters, with letters and numbers.">
        <PasswordInput id="password" name="password" autoComplete="new-password" required minLength={10} autoFocus />
      </Field>
      <Field label="Confirm new password" htmlFor="confirm">
        <PasswordInput id="confirm" name="confirm" autoComplete="new-password" required />
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={loading}>
        Update password
      </Button>
    </form>
  );
}
