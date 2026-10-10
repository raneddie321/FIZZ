import { requirePageAuth } from "@/server/auth/session";
import { db } from "@/server/db";
import { PageHeader } from "@/components/app/page-header";
import { SettingsSection } from "@/components/settings/section";
import { ChangePasswordForm } from "@/components/settings/change-password";
import { TwoFactorSettings } from "@/components/settings/two-factor";
import { Alert } from "@/components/ui/misc";

export const metadata = { title: "Password & security" };

export default async function SecurityPage() {
  const { user } = await requirePageAuth();
  const record = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { passwordHash: true, twoFactorRecoveryCodes: true } });
  const recent = await db.auditLog.findMany({
    where: { userId: user.id, action: { startsWith: "auth." } },
    orderBy: { createdAt: "desc" },
    take: 8,
    select: { id: true, action: true, createdAt: true, ipAddress: true },
  });
  return (
    <>
      <PageHeader title="Password & security" description="Protect your RANEDDIE ID." />
      <SettingsSection title="Password" description={record.passwordHash ? "Changing your password signs you out on other devices." : undefined}>
        {record.passwordHash ? (
          <ChangePasswordForm />
        ) : (
          <Alert>Your password is managed by the central RANEDDIE ID service.</Alert>
        )}
      </SettingsSection>
      <SettingsSection title="Two-step verification" description="Require a code from an authenticator app when signing in with your password.">
        <TwoFactorSettings enabled={user.twoFactorEnabled} recoveryCodesLeft={record.twoFactorRecoveryCodes.length} hasPassword={Boolean(record.passwordHash)} />
      </SettingsSection>
      <SettingsSection title="Recent security activity">
        {recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">No recent activity.</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {recent.map((r) => (
              <li key={r.id} className="flex justify-between gap-4 py-2.5">
                <span>{r.action.replace("auth.", "").replaceAll("_", " ")}</span>
                <span className="text-muted-foreground">
                  {r.createdAt.toLocaleString()} {r.ipAddress && r.ipAddress !== "local" ? `· ${r.ipAddress}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SettingsSection>
    </>
  );
}
