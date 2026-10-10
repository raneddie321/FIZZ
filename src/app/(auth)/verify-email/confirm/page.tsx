import { AuthCard } from "@/components/auth/auth-card";
import { Alert } from "@/components/ui/misc";
import { ConfirmEmailButton } from "./confirm-button";

export const metadata = { title: "Confirm your email" };

export default async function ConfirmEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <AuthCard title="Confirm your email" subtitle="Confirm that this email address belongs to you.">
      {token ? <ConfirmEmailButton token={token} /> : <Alert variant="error">This link is missing its verification token.</Alert>}
    </AuthCard>
  );
}
