import { PageHeader } from "@/components/app/page-header";
import { Alert } from "@/components/ui/misc";
import { EmailChangeConfirm } from "@/components/settings/email-change-confirm";

export const metadata = { title: "Confirm email change" };

export default async function EmailConfirmPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <>
      <PageHeader title="Confirm your new email" />
      {token ? <EmailChangeConfirm token={token} /> : <Alert variant="error">The confirmation link is incomplete.</Alert>}
    </>
  );
}
