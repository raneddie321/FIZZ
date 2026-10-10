import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FizzMark } from "@/components/brand";
import { Section, SectionHeading } from "@/components/marketing/section";

export const metadata = { title: "Product overview" };

const COMPARISON = [
  { label: "Best for", fizz: "Questions, writing, research, analysis", dev: "Building websites, apps, games and APIs" },
  { label: "Main surface", fizz: "Conversational chat", dev: "Multi-panel workspace driven by chat" },
  { label: "Files", fizz: "Attach documents and images to a message", dev: "Full project file tree with version history" },
  { label: "Actions", fizz: "Answers, drafts, summaries, images", dev: "Edits code, runs builds and tests in a sandbox, prepares purchases" },
  { label: "Control", fizz: "Stop, regenerate, edit messages", dev: "Plans, approvals, pause/cancel, review and revert changes" },
];

export default function ProductOverviewPage() {
  return (
    <>
      <Section className="pb-8">
        <SectionHeading
          eyebrow="Product overview"
          title="Two experiences, one RANEDDIE ID"
          description="FIZZ is a fast, friendly assistant for everyday work. FIZZ DEV is a complete AI development environment. Switch between them any time without signing in again."
        />
      </Section>
      <Section className="pt-0">
        <div className="grid gap-5 md:grid-cols-2">
          {[
            { product: "fizz" as const, name: "FIZZ", href: "/product/fizz", text: "Chat with an assistant that writes, explains, analyzes and creates." },
            { product: "dev" as const, name: "FIZZ DEV", href: "/product/fizz-dev", text: "Describe a product and watch FIZZ DEV plan, build, test and preview it." },
          ].map((p) => (
            <div key={p.name} data-product={p.product === "dev" ? "dev" : undefined} className="space-y-4 rounded-2xl border border-border p-7">
              <FizzMark product={p.product} className="size-9" />
              <h3 className="text-xl font-semibold">{p.name}</h3>
              <p className="text-muted-foreground">{p.text}</p>
              <Button asChild variant="outline">
                <Link href={p.href}>
                  Explore {p.name} <ArrowRight />
                </Link>
              </Button>
            </div>
          ))}
        </div>
        <div className="mt-12 overflow-x-auto rounded-2xl border border-border">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-surface text-left">
              <tr>
                <th className="w-40 px-5 py-3 font-medium text-muted-foreground"> </th>
                <th className="px-5 py-3 font-semibold">FIZZ</th>
                <th className="px-5 py-3 font-semibold">FIZZ DEV</th>
              </tr>
            </thead>
            <tbody>
              {COMPARISON.map((row) => (
                <tr key={row.label} className="border-t border-border">
                  <td className="px-5 py-3.5 font-medium text-muted-foreground">{row.label}</td>
                  <td className="px-5 py-3.5">{row.fizz}</td>
                  <td className="px-5 py-3.5">{row.dev}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="mt-10 grid gap-3 text-sm sm:grid-cols-3">
          {["One account across RANEDDIE products", "Shared plan, usage and wallet", "Light and dark themes everywhere"].map((t) => (
            <li key={t} className="flex items-center gap-2">
              <Check className="size-4 text-primary" /> {t}
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}
