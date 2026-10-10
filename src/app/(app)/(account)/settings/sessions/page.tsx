import { PageHeader } from "@/components/app/page-header";
import { SessionsList } from "@/components/settings/sessions-list";

export const metadata = { title: "Devices & sessions" };

export default function SessionsPage() {
  return (
    <>
      <PageHeader title="Devices & sessions" description="Places where your RANEDDIE ID is signed in. Sessions expire after inactivity." />
      <SessionsList />
    </>
  );
}
