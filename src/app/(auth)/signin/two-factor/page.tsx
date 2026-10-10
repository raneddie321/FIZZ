import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { getRawSession } from "@/server/auth/session";
import { safeNext } from "@/lib/safe-redirect";
import { TwoFactorForm } from "./two-factor-form";

export const metadata = { title: "Two-step verification" };

export default async function TwoFactorPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  const ctx = await getRawSession();
  if (!ctx) redirect(`/signin?next=${encodeURIComponent(next)}`);
  if (!ctx.user.twoFactorEnabled || ctx.session.twoFactorVerified) redirect(next);
  return (
    <AuthCard title="Two-step verification" subtitle={<>Enter the 6-digit code from your authenticator app for <strong className="text-foreground">{ctx.user.email}</strong>.</>}>
      <TwoFactorForm next={next} />
    </AuthCard>
  );
}
