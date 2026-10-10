import { AuthCard } from "@/components/auth/auth-card";
import { Alert } from "@/components/ui/misc";
import { ResetPasswordForm } from "./reset-form";

export const metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <AuthCard title="Choose a new password" subtitle="You'll be signed out on all other devices.">
      {token ? <ResetPasswordForm token={token} /> : <Alert variant="error">This reset link is incomplete. Request a new one.</Alert>}
    </AuthCard>
  );
}
