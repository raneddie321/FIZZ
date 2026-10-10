import { Section, SectionHeading } from "@/components/marketing/section";

export const metadata = { title: "FAQ" };

const FAQ = [
  { q: "What is the difference between FIZZ and FIZZ DEV?", a: "FIZZ is a general AI assistant for conversation, writing, analysis and research. FIZZ DEV is a development workspace where AI agents plan, write, test and preview software projects alongside a code editor, terminal and design tools." },
  { q: "What is a RANEDDIE ID?", a: "RANEDDIE ID is the single account you use across RANEDDIE products. You sign in once and can move between FIZZ and FIZZ DEV without signing in again." },
  { q: "Which AI models does FIZZ use?", a: "FIZZ connects to leading AI model providers through a provider-neutral layer. The models available to you depend on your plan and are shown in the model picker." },
  { q: "Does FIZZ DEV run code on your servers?", a: "No. Commands, builds and tests run in isolated sandbox containers with CPU, memory, time and network limits. When no sandbox is connected, execution is clearly shown as unavailable." },
  { q: "Can FIZZ DEV buy things on my behalf?", a: "Only with your explicit approval, within the spending limits you set in FIZZ Wallet, and only through supported integrations. Recurring charges are always shown before you approve. FIZZ never stores raw card numbers." },
  { q: "Is FIZZ Wallet real money?", a: "FIZZ Wallet currently runs in demo mode with demo funds that have no monetary value. Real-money features will only be enabled after payment-provider integration, security review and the necessary compliance work." },
  { q: "Who can see my conversations and projects?", a: "Only you. Access is enforced on the server for every request. Authorized RANEDDIE staff may access data only when needed for support, security or legal reasons, as described in the Privacy Policy." },
  { q: "Can websites or files trick FIZZ DEV into doing something?", a: "Content from websites, repositories and uploaded documents is treated as untrusted data. It cannot change FIZZ's permissions, approve actions or authorize purchases." },
  { q: "Can I export or delete my data?", a: "Yes. Settings → Data lets you download an export of your account data or permanently delete your account." },
];

export default function FaqPage() {
  return (
    <Section>
      <SectionHeading eyebrow="FAQ" title="Frequently asked questions" />
      <div className="mt-10 divide-y divide-border rounded-2xl border border-border">
        {FAQ.map((item) => (
          <details key={item.q} className="group px-6 py-5 [&_summary::-webkit-details-marker]:hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
              {item.q}
              <span className="text-muted-foreground transition-transform group-open:rotate-45" aria-hidden>
                +
              </span>
            </summary>
            <p className="mt-3 leading-relaxed text-muted-foreground">{item.a}</p>
          </details>
        ))}
      </div>
    </Section>
  );
}
