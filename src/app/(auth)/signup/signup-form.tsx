"use client";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Alert } from "@/components/ui/misc";
import { Checkbox } from "@/components/ui/checkbox";
import { PasswordInput } from "@/components/auth/password-input";
import { apiFetch, ApiClientError } from "@/lib/api-client";

export function SignUpForm({ next }: { next: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [accept, setAccept] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setLoading(true);
    setError(null);
    setFieldErrors({});
    try {
      const res = await apiFetch<{ redirect: string }>("/api/auth/register", {
        method: "POST",
        body: { displayName: form.get("displayName"), email: form.get("email"), password: form.get("password"), acceptTerms: accept, next },
      });
      window.location.assign(res.redirect);
    } catch (err) {
      if (err instanceof ApiClientError && Array.isArray(err.details)) {
        const map: Record<string, string> = {};
        for (const d of err.details as { path: string; message: string }[]) map[d.path] ??= d.message;
        setFieldErrors(map);
      }
      setError(err instanceof Error ? err.message : "Could not create your account.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {error && !Object.keys(fieldErrors).length && <Alert variant="error">{error}</Alert>}
      <Field label="Name" htmlFor="displayName" error={fieldErrors.displayName}>
        <Input id="displayName" name="displayName" autoComplete="name" required maxLength={80} autoFocus />
      </Field>
      <Field label="Email" htmlFor="email" error={fieldErrors.email}>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="Password" htmlFor="password" error={fieldErrors.password} hint="At least 10 characters, with letters and numbers.">
        <PasswordInput id="password" name="password" autoComplete="new-password" required minLength={10} />
      </Field>
      <label className="flex items-start gap-2.5 text-sm text-muted-foreground">
        <Checkbox checked={accept} onCheckedChange={(v) => setAccept(v === true)} className="mt-0.5" aria-describedby="terms-error" />
        <span>
          I agree to the{" "}
          <Link href="/terms" className="text-primary hover:underline" target="_blank">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="text-primary hover:underline" target="_blank">
            Privacy Policy
          </Link>
          .
        </span>
      </label>
      {fieldErrors.acceptTerms && (
        <p id="terms-error" className="text-[13px] text-destructive">
          {fieldErrors.acceptTerms}
        </p>
      )}
      <Button type="submit" size="lg" className="w-full" loading={loading}>
        Create account
      </Button>
    </form>
  );
}
