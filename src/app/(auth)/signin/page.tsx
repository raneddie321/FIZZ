import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { Alert } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { getAuth } from "@/server/auth/session";
import { env, localAuthEnabled, oidcEnabled } from "@/server/env";
import { safeNext } from "@/lib/safe-redirect";
import { SignInForm } from "./signin-form";

export const metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  sso_not_configured: "RANEDDIE ID single sign-on is not configured on this server yet.",
  sso_unavailable: "RANEDDIE ID is temporarily unavailable. Try again shortly.",
  sso_expired: "Your sign-in attempt expired. Please try again.",
  sso_failed: "We couldn't complete sign-in with RANEDDIE ID. Please try again.",
  account_suspended: "This account is not active. Contact support for help.",
};

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  if (await getAuth()) redirect(next);
  const local = localAuthEnabled();
  const sso = oidcEnabled();
  const misconfigured = !local && !sso;
  return (
    <AuthCard
      title="Sign in"
      subtitle="Use your RANEDDIE ID to continue to FIZZ"
      footer={
        local ? (
          <>
            New to RANEDDIE?{" "}
            <Link href={`/signup?next=${encodeURIComponent(next)}`} className="font-medium text-primary hover:underline">
              Create an account
            </Link>
          </>
        ) : null
      }
    >
      <div className="space-y-5">
        {sp.error && ERRORS[sp.error] && <Alert variant="error">{ERRORS[sp.error]}</Alert>}
        {misconfigured && (
          <Alert variant="warning" title="Sign-in is not configured">
            AUTH_MODE is set to “{env().AUTH_MODE}” but RANEDDIE ID issuer and client credentials are missing.
          </Alert>
        )}
        {sso && (
          <Button asChild size="lg" className="w-full" variant={local ? "outline" : "primary"}>
            <a href={`/api/auth/oidc/start?next=${encodeURIComponent(next)}`}>Continue with RANEDDIE ID</a>
          </Button>
        )}
        {sso && local && (
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> or use email <span className="h-px flex-1 bg-border" />
          </div>
        )}
        {local && <SignInForm next={next} />}
      </div>
    </AuthCard>
  );
}
