import Link from "next/link";
import {
  ArrowRight,
  Code2,
  FileText,
  FolderTree,
  Globe,
  Image as ImageIcon,
  LayoutTemplate,
  Lock,
  MessageSquare,
  PenLine,
  ShieldCheck,
  Sparkles,
  SquareTerminal,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FizzMark } from "@/components/brand";
import { FeatureGrid, Section, SectionHeading } from "@/components/marketing/section";

export default function HomePage() {
  return (
    <>
      <Section className="pb-10 pt-16 md:pt-24">
        <div className="mx-auto max-w-3xl space-y-6 text-center">
          <p className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-[13px] text-muted-foreground">
            <Sparkles className="size-3.5 text-primary" /> From RANEDDIE
          </p>
          <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl md:text-[3.6rem] md:leading-[1.05]">
            Think it through with FIZZ. Build it with FIZZ DEV.
          </h1>
          <p className="mx-auto max-w-2xl text-pretty text-lg leading-relaxed text-muted-foreground">
            A friendly AI assistant for everyday questions and writing, and an AI development workspace that plans, codes,
            designs, and tests software with you. One RANEDDIE ID for both.
          </p>
          <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/signup">
                Get started free <ArrowRight />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/product">See how it works</Link>
            </Button>
          </div>
        </div>
        <ProductPreview />
      </Section>

      <Section className="py-12 md:py-20">
        <div className="grid gap-5 md:grid-cols-2">
          <ProductCard
            product="fizz"
            name="FIZZ"
            href="/product/fizz"
            summary="The everyday AI assistant"
            description="Ask questions, write and edit, analyze documents and images, and brainstorm ideas in a fast, focused chat."
            points={["Streaming answers with Markdown, code and math", "File and image understanding", "Organized, searchable history"]}
          />
          <ProductCard
            product="dev"
            name="FIZZ DEV"
            href="/product/fizz-dev"
            summary="The AI development workspace"
            description="Describe what you want to build. FIZZ DEV plans the work, writes the code, and shows a live preview you can edit visually."
            points={["Coordinated planning, coding and review agents", "Code editor, live preview and visual design", "Sandboxed terminal with approvals for sensitive actions"]}
          />
        </div>
      </Section>

      <Section>
        <SectionHeading
          eyebrow="Capabilities"
          title="Everything in one place, controlled from a single conversation"
          description="FIZZ keeps the tools you need close at hand, and asks before it does anything that matters."
        />
        <div className="mt-10">
          <FeatureGrid
            items={[
              { icon: MessageSquare, title: "Natural conversation", description: "Clear answers that stream as they're written, with the ability to stop, regenerate, or edit your message." },
              { icon: FileText, title: "Documents & images", description: "Attach PDFs, text, code and images. FIZZ reads them and answers with the context you provide." },
              { icon: PenLine, title: "Writing & editing", description: "Draft, rewrite, summarize and translate — with formatting that holds up when you paste it elsewhere." },
              { icon: Code2, title: "Multi-file coding", description: "FIZZ DEV reads your project, edits many files at once, and lets you review or revert every change." },
              { icon: LayoutTemplate, title: "Visual design", description: "Select elements in the live preview and adjust spacing, colors and type — changes are written back to source." },
              { icon: SquareTerminal, title: "Sandboxed execution", description: "Builds and tests run in isolated containers with resource limits, never on FIZZ servers." },
              { icon: FolderTree, title: "Projects that persist", description: "Websites, apps, games, dashboards and APIs are saved with full version history." },
              { icon: Globe, title: "Web research", description: "When enabled, FIZZ can search the web and cite its sources.", tag: "Configurable" },
              { icon: ImageIcon, title: "Image generation", description: "Create images from a description through a connected image model.", tag: "Configurable" },
            ]}
          />
        </div>
      </Section>

      <Section>
        <div className="grid items-start gap-10 md:grid-cols-[1fr_1.1fr]">
          <SectionHeading
            eyebrow="Trust & control"
            title="Powerful tools, with you in charge"
            description="FIZZ DEV can run code and prepare purchases, so we designed it around explicit approvals, isolation and transparency."
          />
          <ul className="grid gap-4">
            {[
              { icon: ShieldCheck, title: "Approvals for sensitive actions", body: "Installing packages, running commands, submitting forms and every purchase require your explicit confirmation." },
              { icon: Lock, title: "Isolation by default", body: "Each project runs in its own sandbox with time, memory and network limits. Secrets stay on the server." },
              { icon: Wallet, title: "Spending limits you set", body: "FIZZ Wallet enforces per-purchase and monthly limits and shows recurring charges before you approve.", tag: "Early access" },
            ].map((item) => (
              <li key={item.title} className="flex gap-4 rounded-xl border border-border p-5">
                <item.icon className="mt-0.5 size-5 shrink-0 text-primary" />
                <div className="space-y-1">
                  <p className="flex items-center gap-2 font-medium">
                    {item.title}
                    {item.tag && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{item.tag}</span>}
                  </p>
                  <p className="text-sm leading-relaxed text-muted-foreground">{item.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      <Section className="pb-24">
        <div className="flex flex-col items-center gap-5 rounded-2xl border border-border bg-surface px-6 py-14 text-center">
          <FizzMark className="size-10" />
          <h2 className="text-balance text-3xl font-semibold tracking-tight">Start with a question. Finish with a product.</h2>
          <p className="max-w-xl text-muted-foreground">Create a free RANEDDIE ID to use FIZZ and FIZZ DEV.</p>
          <Button asChild size="lg">
            <Link href="/signup">Create your RANEDDIE ID</Link>
          </Button>
        </div>
      </Section>
    </>
  );
}

function ProductCard(props: { product: "fizz" | "dev"; name: string; href: string; summary: string; description: string; points: string[] }) {
  return (
    <Link
      href={props.href}
      data-product={props.product === "dev" ? "dev" : undefined}
      className="group flex flex-col gap-5 rounded-2xl border border-border bg-card p-7 transition-colors hover:border-primary/40"
    >
      <div className="flex items-center gap-3">
        <FizzMark product={props.product} className="size-9" />
        <div>
          <p className="font-semibold">{props.name}</p>
          <p className="text-sm text-muted-foreground">{props.summary}</p>
        </div>
      </div>
      <p className="leading-relaxed text-muted-foreground">{props.description}</p>
      <ul className="space-y-2 text-sm">
        {props.points.map((p) => (
          <li key={p} className="flex items-start gap-2">
            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
            {p}
          </li>
        ))}
      </ul>
      <span className="mt-auto inline-flex items-center gap-1 text-sm font-medium text-primary">
        Learn more <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}

/** Illustrative layout of the FIZZ DEV workspace (no simulated content). */
function ProductPreview() {
  return (
    <div className="mx-auto mt-14 max-w-5xl" aria-hidden>
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_24px_60px_-24px_hsl(var(--shadow-color)/0.25)]">
        <div className="flex h-10 items-center gap-2 border-b border-border bg-surface px-4">
          <span className="size-2.5 rounded-full bg-border" />
          <span className="size-2.5 rounded-full bg-border" />
          <span className="size-2.5 rounded-full bg-border" />
          <span className="ml-3 h-2.5 w-40 rounded-full bg-muted" />
        </div>
        <div className="grid h-72 grid-cols-[150px_1fr_1.3fr] sm:h-96">
          <div className="space-y-2.5 border-r border-border bg-surface p-4">
            {[70, 55, 80, 60, 45, 75, 50].map((w, i) => (
              <div key={i} className="h-2.5 rounded-full bg-muted" style={{ width: `${w}%`, marginLeft: i % 3 === 0 ? 0 : 12 }} />
            ))}
          </div>
          <div className="flex flex-col gap-3 border-r border-border p-4">
            <div className="ml-auto h-9 w-3/4 rounded-xl bg-primary-soft" />
            <div className="space-y-2">
              <div className="h-2.5 w-11/12 rounded-full bg-muted" />
              <div className="h-2.5 w-4/5 rounded-full bg-muted" />
              <div className="h-2.5 w-2/3 rounded-full bg-muted" />
            </div>
            <div className="rounded-lg border border-border p-3">
              <div className="mb-2 h-2.5 w-1/3 rounded-full bg-dev/40" />
              <div className="h-2 w-3/4 rounded-full bg-muted" />
            </div>
            <div className="mt-auto h-10 rounded-xl border border-border" />
          </div>
          <div className="flex flex-col">
            <div className="flex-1 space-y-2 p-4 font-mono">
              {[40, 65, 55, 80, 35, 60, 72, 30].map((w, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="w-4 text-right text-[10px] text-muted-foreground/60">{i + 1}</span>
                  <div className={`h-2 rounded-full ${i % 4 === 1 ? "bg-primary/30" : "bg-muted"}`} style={{ width: `${w}%`, marginLeft: (i % 3) * 10 }} />
                </div>
              ))}
            </div>
            <div className="h-20 border-t border-border bg-code p-3">
              <div className="h-2 w-1/2 rounded-full bg-muted" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
