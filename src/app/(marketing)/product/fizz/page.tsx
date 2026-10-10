import Link from "next/link";
import { Brain, FileSearch, Globe, Image as ImageIcon, Keyboard, ListChecks, MessageSquare, PenLine, Sigma, Code2, History, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FeatureGrid, Section, SectionHeading } from "@/components/marketing/section";

export const metadata = { title: "FIZZ — AI assistant" };

export default function FizzProductPage() {
  return (
    <>
      <Section className="pb-10">
        <SectionHeading
          eyebrow="FIZZ"
          title="An AI assistant that's simple, fast and genuinely helpful"
          description="Ask anything, write better, understand documents and images, and keep every conversation organized."
        />
        <div className="mt-8 flex gap-3">
          <Button asChild size="lg">
            <Link href="/signup?next=/chat">Try FIZZ</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/pricing">View plans</Link>
          </Button>
        </div>
      </Section>
      <Section className="pt-0">
        <FeatureGrid
          items={[
            { icon: MessageSquare, title: "Natural conversations", description: "Responses stream in real time. Stop, regenerate, copy, or edit an earlier message and continue from there." },
            { icon: PenLine, title: "Writing and editing", description: "Drafts, rewrites, tone changes, summaries and translations with clean formatting." },
            { icon: Brain, title: "Multi-step reasoning", description: "Works through complex questions step by step when a problem calls for it." },
            { icon: Code2, title: "Programming help", description: "Explains code, finds bugs and writes snippets with syntax highlighting." },
            { icon: Sigma, title: "Math and tables", description: "Renders mathematical notation, tables and lists properly." },
            { icon: Paperclip, title: "Attachments", description: "Drag and drop PDFs, text files, code and images into the conversation." },
            { icon: FileSearch, title: "Document analysis", description: "Summarize, compare and extract information from the files you share." },
            { icon: ImageIcon, title: "Image understanding & creation", description: "Describe and analyze images; generate new ones with a connected image model.", tag: "Configurable" },
            { icon: Globe, title: "Web research", description: "Search the web for current information with cited sources.", tag: "Configurable" },
            { icon: History, title: "Organized history", description: "Search, rename, archive and delete conversations. Titles are generated automatically." },
            { icon: ListChecks, title: "Structured output", description: "Ask for checklists, JSON, tables or step-by-step plans." },
            { icon: Keyboard, title: "Keyboard friendly", description: "Shortcuts for new chats, search, sending and stopping — plus a responsive mobile layout." },
          ]}
        />
      </Section>
    </>
  );
}
