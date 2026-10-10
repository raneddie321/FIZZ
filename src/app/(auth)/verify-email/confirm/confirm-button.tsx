"use client";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/misc";
import { apiFetch } from "@/lib/api-client";

// Confirmation requires a click so that link scanners in email clients can't consume the token.
export function ConfirmEmailButton({ token }: { token: string }) {
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  if (state === "done") {
    return (
      <div className="space-y-4">
        <Alert variant="success" title="Email verified">Your RANEDDIE ID is ready.</Alert>
        <Button asChild size="lg" className="w-full">
          <Link href="/chat">Continue to FIZZ</Link>
        </Button>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {error && <Alert variant="error">{error}</Alert>}
      <Button
        size="lg"
        className="w-full"
        loading={state === "loading"}
        onClick={async () => {
          setState("loading");
          setError(null);
          try {
            await apiFetch("/api/auth/verify-email", { method: "POST", body: { token } });
            setState("done");
          } catch (err) {
            setError(err instanceof Error ? err.message : "Verification failed.");
            setState("idle");
          }
        }}
      >
        Confirm email address
      </Button>
    </div>
  );
}
