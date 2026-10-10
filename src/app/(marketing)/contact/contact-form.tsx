"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert } from "@/components/ui/misc";
import { apiFetch } from "@/lib/api-client";

export function ContactForm({ defaultName, defaultEmail }: { defaultName?: string; defaultEmail?: string }) {
  const [category, setCategory] = useState("general");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setLoading(true);
    setError(null);
    try {
      await apiFetch("/api/support", {
        method: "POST",
        body: { name: form.get("name"), email: form.get("email"), subject: form.get("subject"), message: form.get("message"), category },
      });
      setSent(true);
      toast.success("Message sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send your message.");
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <Alert variant="success" title="Thanks — we received your message.">
        We&apos;ll reply to the email address you provided.
      </Alert>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-border p-6">
      {error && <Alert variant="error">{error}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="name">
          <Input id="name" name="name" required maxLength={80} defaultValue={defaultName} autoComplete="name" />
        </Field>
        <Field label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" required maxLength={254} defaultValue={defaultEmail} autoComplete="email" />
        </Field>
      </div>
      <Field label="Topic">
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger aria-label="Topic">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="general">General question</SelectItem>
            <SelectItem value="account">Account & RANEDDIE ID</SelectItem>
            <SelectItem value="billing">Billing & subscriptions</SelectItem>
            <SelectItem value="wallet">FIZZ Wallet & purchases</SelectItem>
            <SelectItem value="technical">Technical problem</SelectItem>
            <SelectItem value="abuse">Report abuse</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field label="Subject" htmlFor="subject">
        <Input id="subject" name="subject" required maxLength={140} />
      </Field>
      <Field label="Message" htmlFor="message">
        <Textarea id="message" name="message" required minLength={10} maxLength={5000} rows={6} />
      </Field>
      <Button type="submit" loading={loading} className="w-full sm:w-auto">
        Send message
      </Button>
    </form>
  );
}
