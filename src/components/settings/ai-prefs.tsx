"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SettingsRow, SettingsSection } from "./section";
import { apiFetch } from "@/lib/api-client";

type Model = { id: string; name: string; available: boolean; reason?: string };

export function AiPrefsForm({
  models,
  initial,
}: {
  models: Model[];
  initial: { defaultModel: string | null; responseStyle: string; customInstructions: string; webSearchByDefault: boolean };
}) {
  const [values, setValues] = useState(initial);
  const [loading, setLoading] = useState(false);
  return (
    <SettingsSection
      title="Responses"
      footer={
        <Button
          loading={loading}
          onClick={async () => {
            setLoading(true);
            try {
              await apiFetch("/api/account/preferences", { method: "PATCH", body: { ai: values } });
              toast.success("AI preferences saved");
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Could not save");
            } finally {
              setLoading(false);
            }
          }}
        >
          Save
        </Button>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Default model">
            <Select value={values.defaultModel ?? "__platform"} onValueChange={(v) => setValues({ ...values, defaultModel: v === "__platform" ? null : v })}>
              <SelectTrigger aria-label="Default model">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__platform">Platform default</SelectItem>
                {models.map((m) => (
                  <SelectItem key={m.id} value={m.id} disabled={!m.available}>
                    {m.name}
                    {!m.available && m.reason ? ` — ${m.reason}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Response style">
            <Select value={values.responseStyle} onValueChange={(v) => setValues({ ...values, responseStyle: v })}>
              <SelectTrigger aria-label="Response style">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="balanced">Balanced</SelectItem>
                <SelectItem value="concise">Concise</SelectItem>
                <SelectItem value="detailed">Detailed</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
        <Field label="Custom instructions" hint="Anything FIZZ should know about you or how you'd like it to respond. Max 2,000 characters.">
          <Textarea value={values.customInstructions} onChange={(e) => setValues({ ...values, customInstructions: e.target.value })} maxLength={2000} rows={5} />
        </Field>
        <SettingsRow label="Search the web by default" description="When web search is available, enable it for new messages.">
          <Switch checked={values.webSearchByDefault} onCheckedChange={(c) => setValues({ ...values, webSearchByDefault: c })} aria-label="Search the web by default" />
        </SettingsRow>
      </div>
    </SettingsSection>
  );
}
