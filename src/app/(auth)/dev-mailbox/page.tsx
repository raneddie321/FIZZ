import { notFound } from "next/navigation";
import { db } from "@/server/db";
import { isProduction } from "@/server/env";
import { formatDateTime } from "@/lib/utils";

export const metadata = { title: "Development mailbox" };
export const dynamic = "force-dynamic";

/** Development-only view of emails recorded because no email provider is configured. */
export default async function DevMailboxPage() {
  if (isProduction()) notFound();
  const emails = await db.outboundEmail.findMany({ where: { status: "LOGGED" }, orderBy: { createdAt: "desc" }, take: 25 });
  const linkify = (text: string) =>
    text.split(/(https?:\/\/\S+)/g).map((part, i) =>
      /^https?:\/\//.test(part) ? (
        <a key={i} href={part} className="break-all text-primary underline">
          {part}
        </a>
      ) : (
        part
      ),
    );
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-6">
        <h1 className="text-xl font-semibold">Development mailbox</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Emails recorded because no email provider is configured. These were <strong>not delivered</strong>. This page is disabled in production.
        </p>
      </div>
      {emails.length === 0 && <p className="text-center text-sm text-muted-foreground">No messages yet.</p>}
      {emails.map((m) => (
        <div key={m.id} className="rounded-xl border border-border bg-card p-5 text-sm">
          <p className="font-medium">{m.subject}</p>
          <p className="text-xs text-muted-foreground">
            To {m.to} · {formatDateTime(m.createdAt)}
          </p>
          <p className="mt-3 whitespace-pre-wrap text-muted-foreground">{linkify(m.text)}</p>
        </div>
      ))}
    </div>
  );
}
