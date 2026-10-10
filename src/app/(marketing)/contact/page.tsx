import { Section, SectionHeading } from "@/components/marketing/section";
import { ContactForm } from "./contact-form";
import { getAuth } from "@/server/auth/session";

export const metadata = { title: "Contact support" };

export default async function ContactPage() {
  const auth = await getAuth();
  return (
    <Section>
      <div className="grid gap-12 md:grid-cols-[1fr_1.2fr]">
        <SectionHeading
          eyebrow="Support"
          title="How can we help?"
          description="Send us a message and the RANEDDIE support team will get back to you by email. Signed-in users can also track requests under Help & Support."
        />
        <ContactForm defaultName={auth?.user.displayName} defaultEmail={auth?.user.email} />
      </div>
    </Section>
  );
}
