import { LegalPage } from "@/components/marketing/legal";

export const metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="To be determined">
      <h2>1. Information we collect</h2>
      <p>Placeholder: account details (name, email), conversations, uploaded files, projects, usage records, payment metadata, and technical logs such as IP address and device information.</p>
      <h2>2. How we use information</h2>
      <p>Placeholder: providing and securing the service, processing requests with AI model providers, billing, support, and abuse prevention.</p>
      <h2>3. AI providers and subprocessors</h2>
      <p>Placeholder: list of AI model providers, hosting, storage, email, payment and sandbox providers that process data on RANEDDIE&apos;s behalf.</p>
      <h2>4. Retention</h2>
      <p>Placeholder for retention periods.</p>
      <h2>5. Your rights</h2>
      <p>You can export your data and delete your account from Settings → Data. Placeholder for region-specific rights (e.g. GDPR, CCPA).</p>
      <h2>6. Security</h2>
      <p>Placeholder describing encryption in transit, encryption of secrets at rest, access controls and isolated code execution.</p>
      <h2>7. Contact</h2>
      <p>Placeholder for RANEDDIE&apos;s privacy contact details.</p>
    </LegalPage>
  );
}
