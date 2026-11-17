import { requirePageAuth } from "@/server/auth/session";
import { env } from "@/server/env";
import { PageHeader } from "@/components/app/page-header";
import { SettingsSection } from "@/components/settings/section";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Payment Vault" };

export default async function PaymentVaultPage() {
  await requirePageAuth();
  const configured = Boolean(env().STRIPE_SECRET_KEY && env().STRIPE_PUBLISHABLE_KEY);
  return (
    <>
      <PageHeader
        title="Payment Vault"
        description="Manage payment methods through a secure payment provider. FIZZ never stores or displays your full card number or security code."
      />
      <SettingsSection
        title="Saved payment methods"
        description="Cards will be stored by the payment provider. FIZZ will retain only an opaque provider reference and safe display details such as brand and last four digits."
      >
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Badge variant={configured ? "success" : "warning"}>{configured ? "Provider configured" : "Setup required"}</Badge>
            <span className="text-xs text-muted-foreground">Stripe</span>
          </div>
          <p className="text-sm text-muted-foreground">
            {configured
              ? "Provider credentials are present. The hosted setup flow and customer/payment-method endpoints still need to be enabled before cards can be added."
              : "Adding cards is unavailable until the site owner configures STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY in the deployment environment."}
          </p>
          <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm">
            <p className="font-medium">Privacy boundary</p>
            <p className="mt-1 text-muted-foreground">
              Card numbers and CVC must be entered directly into a payment-provider hosted form. They must never be pasted into FIZZ chat, FIZZ DEV, project files, or the browser agent. This page does not accept raw card details.
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            Local browser autofill is a separate desktop capability and is not enabled yet. FIZZ cannot guarantee that every merchant checkout supports automated filling. You must review and submit each payment yourself.
          </p>
        </div>
      </SettingsSection>
      <SettingsSection
        title="Local browser"
        description="Use a desktop browser companion on this device instead of a cloud browser for local browsing tasks."
      >
        <div className="flex flex-col gap-2">
          <Badge variant="warning">Desktop companion scaffold</Badge>
          <p className="text-sm text-muted-foreground">
            The first local companion build is available in the repository under local-browser/. Pairing with this hosted account and routing FIZZ DEV agent actions to it are not enabled yet.
          </p>
          <a className="text-sm text-primary underline underline-offset-4" href="https://github.com/raneddie321/FIZZ/tree/main/local-browser">
            View local browser source
          </a>
        </div>
      </SettingsSection>
    </>
  );
}
