"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Copy, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Alert } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PasswordInput } from "@/components/auth/password-input";
import { apiFetch } from "@/lib/api-client";

export function TwoFactorSettings({ enabled, recoveryCodesLeft, hasPassword }: { enabled: boolean; recoveryCodesLeft: number; hasPassword: boolean }) {
  const router = useRouter();
  const [setup, setSetup] = useState<{ secret: string; qrSvg: string } | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);

  if (!hasPassword) return <Alert>Two-step verification for single sign-on accounts is managed by the RANEDDIE ID service.</Alert>;

  if (codes) {
    return (
      <div className="space-y-4">
        <Alert variant="success" title="Two-step verification is on">
          Save these recovery codes somewhere safe. Each can be used once if you lose access to your authenticator app. They won&apos;t be shown again.
        </Alert>
        <div className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-surface p-4 font-mono text-sm sm:grid-cols-4">
          {codes.map((c) => (
            <span key={c}>{c}</span>
          ))}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              void navigator.clipboard.writeText(codes.join("\n"));
              toast.success("Recovery codes copied");
            }}
          >
            <Copy /> Copy codes
          </Button>
          <Button
            onClick={() => {
              setCodes(null);
              router.refresh();
            }}
          >
            Done
          </Button>
        </div>
      </div>
    );
  }

  if (enabled) {
    return (
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <ShieldCheck className="size-5 text-success" />
          <div>
            <p className="flex items-center gap-2 text-sm font-medium">
              Authenticator app <Badge variant="success">On</Badge>
            </p>
            <p className="text-[13px] text-muted-foreground">{recoveryCodesLeft} recovery codes remaining</p>
          </div>
        </div>
        <Button variant="outline" onClick={() => setDisableOpen(true)}>
          Turn off
        </Button>
        <Dialog open={disableOpen} onOpenChange={setDisableOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Turn off two-step verification?</DialogTitle>
              <DialogDescription>Your account will be protected by your password only.</DialogDescription>
            </DialogHeader>
            <form
              className="space-y-4"
              onSubmit={async (e) => {
                e.preventDefault();
                setLoading(true);
                try {
                  await apiFetch("/api/account/2fa/disable", { method: "POST", body: { password: new FormData(e.currentTarget).get("password") } });
                  toast.success("Two-step verification turned off");
                  setDisableOpen(false);
                  router.refresh();
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Could not turn off");
                } finally {
                  setLoading(false);
                }
              }}
            >
              <Field label="Password" htmlFor="disable-password">
                <PasswordInput id="disable-password" name="password" required autoComplete="current-password" />
              </Field>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDisableOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="destructive" loading={loading}>
                  Turn off
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  if (setup) {
    return (
      <div className="grid gap-6 sm:grid-cols-[auto_1fr]">
        <div className="size-48 rounded-lg border border-border bg-white p-2 [&_svg]:size-full" dangerouslySetInnerHTML={{ __html: setup.qrSvg }} aria-label="QR code for authenticator app" role="img" />
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setLoading(true);
            try {
              const res = await apiFetch<{ recoveryCodes: string[] }>("/api/account/2fa/confirm", { method: "POST", body: { code: new FormData(e.currentTarget).get("code") } });
              setCodes(res.recoveryCodes);
              setSetup(null);
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Invalid code");
            } finally {
              setLoading(false);
            }
          }}
        >
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Scan the QR code with an authenticator app.</li>
            <li>
              Or enter this key manually: <code className="break-all rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">{setup.secret}</code>
            </li>
            <li>Enter the 6-digit code the app shows.</li>
          </ol>
          <Field label="Verification code" htmlFor="totp-code">
            <Input id="totp-code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required className="max-w-40 font-mono tracking-widest" />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" loading={loading}>
              Verify and turn on
            </Button>
            <Button type="button" variant="ghost" onClick={() => setSetup(null)}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted-foreground">Two-step verification is off.</p>
      <Button
        loading={loading}
        onClick={async () => {
          setLoading(true);
          try {
            setSetup(await apiFetch<{ secret: string; qrSvg: string }>("/api/account/2fa/setup", { method: "POST" }));
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Could not start setup");
          } finally {
            setLoading(false);
          }
        }}
      >
        Set up authenticator app
      </Button>
    </div>
  );
}
