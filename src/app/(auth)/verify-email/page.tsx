import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { Alert } from "@/components/ui/misc";
import { getRawSession } from "@/server/auth/session";
import { emailConfigured } from "@/server/email";
import { isProduction } from "@/server/env";
import { safeNext } from "@/lib/safe-redirect";
import { VerifyEmailActions } from "./verify-actions";

export const metadata = { title: "Verify your email" };

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  const ctx = await getRawSession();
  if (!ctx) redirect(`/signin?next=${encodeURIComponent(next)}`);
  if (ctx.user.emailVerifiedAt) redirect(next);
  return (
    <AuthCard
      title="Check your inbox"
      subtitle={
        <>
          We sent a verification link to <strong className="text-foreground">{ctx.user.email}</strong>. Open it to finish setting up your account.
        </>
      }
    >
      <div className="space-y-4">
        {!emailConfigured() && (
          <Alert variant="warning" title="Email delivery is not configured">
            {isProduction() ? (
              "This server cannot send email yet. Contact support."
            ) : (
              <>
                No email provider is set up, so messages are recorded instead of sent. Open the{" "}
                <a href="/dev-mailbox">development mailbox</a> to find your link.
              </>
            )}
          </Alert>
        )}
        <VerifyEmailActions next={next} />
      </div>
    </AuthCard>
  );
}
