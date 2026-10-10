import Link from "next/link";
import {
  Bot,
  Bug,
  ClipboardList,
  Code2,
  Eye,
  GitBranch,
  Globe,
  History,
  LayoutTemplate,
  MonitorSmartphone,
  ShieldCheck,
  ShoppingCart,
  SquareTerminal,
  TestTube2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FeatureGrid, Section, SectionHeading } from "@/components/marketing/section";

export const metadata = { title: "FIZZ DEV — AI development workspace" };

const STEPS = [
  "Understands your request and asks for anything essential",
  "Creates a development plan and picks a suitable stack",
  "Generates the project structure, frontend, backend and data models",
  "Installs dependencies and runs builds and tests in a sandbox — with your approval",
  "Finds and fixes errors, then shows a live preview",
  "Explains what changed and prepares the project for deployment",
];

export default function FizzDevProductPage() {
  return (
    <div data-product="dev">
      <Section className="pb-10">
        <SectionHeading
          eyebrow="FIZZ DEV"
          title="Describe it. FIZZ DEV builds it — with you in control."
          description="An AI-powered workspace that combines a coding agent, a code editor, a design tool, a sandboxed terminal and a live preview."
        />
        <div className="mt-8 flex gap-3">
          <Button asChild size="lg">
            <Link href="/signup?next=/dev">Start a project</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/pricing">View plans</Link>
          </Button>
        </div>
      </Section>
      <Section className="pt-0">
        <div className="grid gap-10 rounded-2xl border border-border p-8 md:grid-cols-[1fr_1.2fr]">
          <div className="space-y-3">
            <h3 className="text-xl font-semibold">From idea to working project</h3>
            <p className="text-muted-foreground">
              Ask for something like “a multiplayer game website with accounts, an admin dashboard and a shop”. FIZZ DEV coordinates
              planning, coding, testing and review agents — one step at a time, never uncontrolled.
            </p>
          </div>
          <ol className="space-y-3">
            {STEPS.map((s, i) => (
              <li key={s} className="flex gap-3 text-sm">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-dev-soft font-mono text-xs font-semibold text-dev">{i + 1}</span>
                <span className="pt-0.5">{s}</span>
              </li>
            ))}
          </ol>
        </div>
      </Section>
      <Section className="pt-0">
        <FeatureGrid
          items={[
            { icon: Bot, title: "Coordinated agents", description: "Planning, coding, design, testing, debugging and review agents work through a shared plan." },
            { icon: Code2, title: "Professional editor", description: "Monaco-based editor with tabs, search and replace, formatting, diagnostics and diffs." },
            { icon: LayoutTemplate, title: "Visual design studio", description: "Select elements in the live preview and edit layout, color and type — written back to your source files." },
            { icon: Eye, title: "Live preview", description: "See changes immediately with desktop, tablet and phone viewports." },
            { icon: SquareTerminal, title: "Sandboxed terminal", description: "Run builds, tests and package installs in isolated containers with resource limits.", tag: "Requires sandbox" },
            { icon: TestTube2, title: "Build & test results", description: "Console output, build logs and errors in one panel — with explanations." },
            { icon: History, title: "Version history", description: "Every change is recorded. Review diffs and revert files or whole agent tasks." },
            { icon: GitBranch, title: "Git integration", description: "Import from and push to GitHub repositories." },
            { icon: ShieldCheck, title: "Approvals & permissions", description: "Sensitive tools require explicit approval. Content from websites and files can never grant permissions." },
            { icon: Globe, title: "Browser automation", description: "Research services and prepare sign-ups in an isolated browser. Never bypasses CAPTCHAs.", tag: "Early access" },
            { icon: ShoppingCart, title: "Assisted purchasing", description: "Find domains, hosting and developer tools within your budget — nothing is bought without approval.", tag: "Early access" },
            { icon: MonitorSmartphone, title: "Many project types", description: "Websites, web and mobile apps, games, dashboards, SaaS, APIs, automations and more." },
          ]}
        />
      </Section>
      <Section className="pt-0">
        <div className="flex items-start gap-3 rounded-xl border border-border bg-surface p-5 text-sm text-muted-foreground">
          <ClipboardList className="mt-0.5 size-4 shrink-0 text-dev" />
          <p>
            <Bug className="mr-1 inline size-3.5" /> FIZZ DEV is focused on software creation: code, design, testing and the services
            software needs — like domains and hosting. It is not a general business-services broker.
          </p>
        </div>
      </Section>
    </div>
  );
}
