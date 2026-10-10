import { requirePageAuth } from "@/server/auth/session";
import { db } from "@/server/db";
import { PageHeader } from "@/components/app/page-header";
import { SettingsSection, SettingsRow } from "@/components/settings/section";
import { ProfileForm } from "@/components/settings/profile-form";
import { ChangeEmailDialog } from "@/components/settings/change-email";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Profile" };

export default async function ProfileSettingsPage() {
  const { user } = await requirePageAuth();
  const [record, identities] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: user.id }, select: { createdAt: true, passwordHash: true } }),
    db.identityMapping.findMany({ where: { userId: user.id }, select: { provider: true, issuer: true, createdAt: true } }),
  ]);
  return (
    <>
      <PageHeader title="Profile" description="Your RANEDDIE ID details, shared across FIZZ and FIZZ DEV." />
      <SettingsSection title="Personal information">
        <ProfileForm displayName={user.displayName} avatarUrl={user.avatarUrl ?? ""} />
      </SettingsSection>
      <SettingsSection title="Email address">
        <SettingsRow
          label={user.email}
          description={user.emailVerifiedAt ? `Verified on ${formatDate(user.emailVerifiedAt)}` : "Not verified"}
        >
          {record.passwordHash ? <ChangeEmailDialog /> : <span className="text-[13px] text-muted-foreground">Managed by RANEDDIE ID</span>}
        </SettingsRow>
      </SettingsSection>
      <SettingsSection title="RANEDDIE ID">
        <SettingsRow label="Account ID" description="Use this when contacting support.">
          <code className="rounded bg-muted px-2 py-1 font-mono text-xs">{user.id}</code>
        </SettingsRow>
        <SettingsRow label="Member since">
          <span className="text-sm text-muted-foreground">{formatDate(record.createdAt)}</span>
        </SettingsRow>
        <SettingsRow label="Sign-in methods">
          <div className="flex flex-wrap gap-1.5">
            {identities.map((i) => (
              <Badge key={i.provider + i.issuer} variant={i.provider === "local" ? "neutral" : "primary"}>
                {i.provider === "local" ? "Email & password (development RANEDDIE ID)" : "RANEDDIE ID SSO"}
              </Badge>
            ))}
          </div>
        </SettingsRow>
      </SettingsSection>
    </>
  );
}
