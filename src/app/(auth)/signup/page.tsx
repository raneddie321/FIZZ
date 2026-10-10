import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/misc";
import { getAuth } from "@/server/auth/session";
import { localAuthEnabled, oidcEnabled } from "@/server/env";
import { safeNext } from "@/lib/safe-redirect";
import { SignUpForm } from "./signup-form";

export const metadata = { title: "Create your RANEDDIE ID" };

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  if (await getAuth()) redirect(next);
  return (
    <AuthCard
      title="Create your RANEDDIE ID"
      subtitle="One account for FIZZ, FIZZ DEV and other RANEDDIE products"
      footer={
        <>
          Already have an account?{" "}
          <Link href={`/signin?next=${encodeURIComponent(next)}`} className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      {localAuthEnabled() ? (
        <SignUpForm next={next} />
      ) : oidcEnabled() ? (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Accounts are created through the central RANEDDIE ID service.</p>
          <Button asChild size="lg" className="w-full">
            <a href={`/api/auth/oidc/start?next=${encodeURIComponent(next)}`}>Continue with RANEDDIE ID</a>
          </Button>
        </div>
      ) : (
        <Alert variant="warning">Account creation is not configured on this server.</Alert>
      )}
    </AuthCard>
  );
}
