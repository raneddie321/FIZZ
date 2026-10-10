"use client";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/misc";
import { apiFetch } from "@/lib/api-client";

export function EmailChangeConfirm({ token }: { token: string }) {
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  if (state === "done")
    return (
      <Alert variant="success" title="Email updated" action={<Button asChild size="sm" variant="outline"><Link href="/settings">Back to settings</Link></Button>}>
        Your RANEDDIE ID now uses the new address.
      </Alert>
    );
  return (
    <div className="space-y-4">
      {error && <Alert variant="error">{error}</Alert>}
      <Button
        loading={state === "loading"}
        onClick={async () => {
          setState("loading");
          try {
            await apiFetch("/api/account/email/confirm", { method: "POST", body: { token } });
            setState("done");
          } catch (err) {
            setError(err instanceof Error ? err.message : "Could not confirm");
            setState("idle");
          }
        }}
      >
        Confirm new email
      </Button>
    </div>
  );
}
