import { requirePageAuth } from "@/server/auth/session";
import { PageHeader } from "@/components/app/page-header";
import { NotificationPrefsForm } from "@/components/settings/notification-prefs";

export const metadata = { title: "Notification preferences" };

export default async function NotificationPrefsPage() {
  const { user } = await requirePageAuth();
  const prefs = ((user.preferences ?? {}) as { notifications?: Record<string, boolean> }).notifications ?? {};
  return (
    <>
      <PageHeader title="Notification preferences" description="Choose which emails RANEDDIE sends you. In-app notifications are always shown." />
      <NotificationPrefsForm initial={prefs} />
    </>
  );
}
