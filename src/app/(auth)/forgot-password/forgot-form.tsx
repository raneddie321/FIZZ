"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Alert } from "@/components/ui/misc";
import { apiFetch } from "@/lib/api-client";

export function ForgotPasswordForm() {
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (sent) {
    return (
      <Alert variant="success" title="Check your email">
        If an account exists for that address, a password reset link is on its way. The link expires in 1 hour.
      </Alert>
    );
  }
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
          await apiFetch("/api/auth/forgot-password", { method: "POST", body: { email: new FormData(e.currentTarget).get("email") } });
          setSent(true);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Something went wrong.");
        } finally {
          setLoading(false);
        }
      }}
    >
      {error && <Alert variant="error">{error}</Alert>}
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={loading}>
        Send reset link
      </Button>
    </form>
  );
}
