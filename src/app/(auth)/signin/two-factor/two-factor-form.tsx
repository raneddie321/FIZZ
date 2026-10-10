"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Alert } from "@/components/ui/misc";
import { apiFetch } from "@/lib/api-client";

export function TwoFactorForm({ next }: { next: string }) {
  const [useRecovery, setUseRecovery] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = String(new FormData(e.currentTarget).get("code") ?? "");
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ redirect: string }>("/api/auth/two-factor", { method: "POST", body: { code, next } });
      window.location.assign(res.redirect);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed.");
      setLoading(false);
    }
  }

  async function signOut() {
    await apiFetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    window.location.assign("/signin");
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && <Alert variant="error">{error}</Alert>}
      <Field label={useRecovery ? "Recovery code" : "Verification code"} htmlFor="code">
        <Input
          key={String(useRecovery)}
          id="code"
          name="code"
          required
          autoFocus
          autoComplete="one-time-code"
          inputMode={useRecovery ? "text" : "numeric"}
          placeholder={useRecovery ? "XXXXX-XXXXX" : "123456"}
          maxLength={useRecovery ? 11 : 6}
          className="font-mono tracking-widest"
        />
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={loading}>
        Verify
      </Button>
      <div className="flex items-center justify-between text-sm">
        <button type="button" className="font-medium text-primary hover:underline" onClick={() => setUseRecovery((v) => !v)}>
          {useRecovery ? "Use authenticator code" : "Use a recovery code"}
        </button>
        <button type="button" className="text-muted-foreground hover:text-foreground" onClick={signOut}>
          Sign out
        </button>
      </div>
    </form>
  );
}
