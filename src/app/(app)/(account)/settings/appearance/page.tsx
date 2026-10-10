import { requirePageAuth } from "@/server/auth/session";
import { PageHeader } from "@/components/app/page-header";
import { AppearanceForm } from "@/components/settings/appearance-form";

export const metadata = { title: "Appearance & language" };

export default async function AppearancePage() {
  const { user } = await requirePageAuth();
  return (
    <>
      <PageHeader title="Appearance & language" />
      <AppearanceForm language={user.language} />
    </>
  );
}
