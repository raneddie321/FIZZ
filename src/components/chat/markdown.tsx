"use client";
import { memo, useState } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

function textOf(node: unknown): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (node && typeof node === "object" && "props" in node) return textOf((node as { props: { children?: unknown } }).props.children);
  return "";
}

function CodeBlock({ children, className }: { children?: React.ReactNode; className?: string }) {
  const [copied, setCopied] = useState(false);
  const lang = /language-([\w+-]+)/.exec(className ?? "")?.[1];
  return (
    <div className="group/code my-4 overflow-hidden rounded-lg border border-border">
      <div className="flex items-center justify-between border-b border-border bg-surface px-3 py-1.5">
        <span className="font-mono text-[11.5px] text-muted-foreground">{lang ?? "text"}</span>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(textOf(children).replace(/\n$/, ""));
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11.5px] text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Copy code"
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre>
        <code className={cn(className, "hljs")}>{children}</code>
      </pre>
    </div>
  );
}

const components: Components = {
  pre: ({ children }) => <>{children}</>,
  code: ({ className, children, ...props }) => {
    const isBlock = /language-/.test(className ?? "") || String(children ?? "").includes("\n");
    if (isBlock) return <CodeBlock className={className}>{children}</CodeBlock>;
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  },
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow">
      {children}
    </a>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto">
      <table>{children}</table>
    </div>
  ),
  img: ({ src, alt }) => (typeof src === "string" && src.startsWith("/api/attachments/") ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt ?? ""} className="max-w-full rounded-lg" />
  ) : (
    <a href={typeof src === "string" ? src : undefined} target="_blank" rel="noopener noreferrer nofollow">
      {alt || "image link"}
    </a>
  )),
};

/** Renders untrusted model Markdown. Raw HTML is not enabled, so it is escaped. */
export const Markdown = memo(function Markdown({ content, className }: { content: string; className?: string }) {
  return (
    <div className={cn("fizz-prose break-words", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, [remarkMath, { singleDollarTextMath: true }]]}
        rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: "ignore" }], [rehypeHighlight, { detect: false, ignoreMissing: true }]]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
