import { requirePageAuth } from "@/server/auth/session";
import { db } from "@/server/db";
import { PageHeader } from "@/components/app/page-header";
import { SettingsSection } from "@/components/settings/section";
import { Button } from "@/components/ui/button";
import { DeleteAccount } from "@/components/settings/delete-account";

export const metadata = { title: "Data & privacy" };

export default async function DataPage() {
  const { user } = await requirePageAuth();
  const record = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { passwordHash: true } });
  return (
    <>
      <PageHeader title="Data & privacy" />
      <SettingsSection title="Export your data" description="Download a JSON file with your profile, conversations, projects, wallet history, purchases, usage and support requests.">
        <Button asChild variant="outline">
          <a href="/api/account/export" download>
            Download export
          </a>
        </Button>
      </SettingsSection>
      <SettingsSection
        danger
        title="Delete account"
        description="Permanently delete your conversations, projects, files and sessions and remove your personal details. Financial records and audit logs are retained in anonymized form where required by law. This cannot be undone."
      >
        <DeleteAccount requiresPassword={Boolean(record.passwordHash)} />
      </SettingsSection>
    </>
  );
}
