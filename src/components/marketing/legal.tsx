import { Alert } from "@/components/ui/misc";

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated: {updated}</p>
      <Alert variant="warning" className="mt-6" title="Placeholder document">
        This page is a placeholder and has not been reviewed by legal counsel. RANEDDIE must replace it with final terms before public launch.
      </Alert>
      <div className="fizz-prose mt-8 [&_h2]:mt-10">{children}</div>
    </article>
  );
}
