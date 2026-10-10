import { requirePageAuth } from "@/server/auth/session";
import { db } from "@/server/db";
import { PageHeader } from "@/components/app/page-header";
import { GitHubConnection } from "@/components/settings/github-connection";
import { SettingsSection } from "@/components/settings/section";

export const metadata = { title: "Connected services" };

export default async function ConnectionsPage() {
  const { user } = await requirePageAuth();
  const github = await db.connectedService.findUnique({
    where: { userId_service: { userId: user.id, service: "github" } },
    select: { accountLabel: true, createdAt: true, scopes: true },
  });
  return (
    <>
      <PageHeader title="Connected services" description="Services FIZZ DEV can use on your behalf. Credentials are encrypted and never shown to AI models." />
      <SettingsSection title="GitHub" description="Import repositories into FIZZ DEV projects and push changes back.">
        <GitHubConnection connected={github ? { login: github.accountLabel ?? "GitHub user", since: github.createdAt.toISOString() } : null} />
      </SettingsSection>
    </>
  );
}
