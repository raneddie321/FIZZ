import { requirePageAuth } from "@/server/auth/session";
import { PageHeader } from "@/components/app/page-header";
import { AiPrefsForm } from "@/components/settings/ai-prefs";
import { availableModelsFor } from "@/server/ai/models";

export const metadata = { title: "AI preferences" };

export default async function AiPrefsPage() {
  const { user } = await requirePageAuth();
  const models = await availableModelsFor(user.id);
  const ai = ((user.preferences ?? {}) as { ai?: Record<string, unknown> }).ai ?? {};
  return (
    <>
      <PageHeader title="AI preferences" description="Personalize how FIZZ responds. These apply to FIZZ chat; FIZZ DEV projects have their own settings." />
      <AiPrefsForm
        models={models.map((m) => ({ id: m.id, name: m.displayName, available: m.available, reason: m.unavailableReason }))}
        initial={{
          defaultModel: (ai.defaultModel as string | null) ?? null,
          responseStyle: (ai.responseStyle as string) ?? "balanced",
          customInstructions: (ai.customInstructions as string) ?? "",
          webSearchByDefault: Boolean(ai.webSearchByDefault),
        }}
      />
    </>
  );
}
