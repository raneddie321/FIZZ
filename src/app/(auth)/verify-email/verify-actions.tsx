"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-client";

export function VerifyEmailActions({ next }: { next: string }) {
  const [loading, setLoading] = useState(false);
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <Button
        variant="outline"
        className="flex-1"
        loading={loading}
        onClick={async () => {
          setLoading(true);
          try {
            const res = await apiFetch<{ status: string }>("/api/auth/verify-email/resend", { method: "POST" });
            if (res.status === "already_verified") window.location.assign(next);
            else if (res.status === "FAILED") toast.error("We couldn't send the email. Try again later.");
            else toast.success(res.status === "SENT" ? "Verification email sent" : "Verification link recorded in the development mailbox");
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Could not resend email");
          } finally {
            setLoading(false);
          }
        }}
      >
        Resend email
      </Button>
      <Button variant="ghost" className="flex-1" onClick={() => window.location.reload()}>
        I&apos;ve verified
      </Button>
      <Button
        variant="subtle"
        onClick={async () => {
          await apiFetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
          window.location.assign("/signin");
        }}
      >
        Sign out
      </Button>
    </div>
  );
}
