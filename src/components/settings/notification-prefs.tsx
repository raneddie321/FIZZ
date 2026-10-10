"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { SettingsRow, SettingsSection } from "./section";
import { apiFetch } from "@/lib/api-client";

const ITEMS = [
  { key: "agentTaskEmails", label: "FIZZ DEV task updates", description: "When an agent task finishes, fails or needs your approval.", def: true },
  { key: "purchaseEmails", label: "Purchases & wallet", description: "Purchase requests, approvals, receipts and refunds.", def: true },
  { key: "productUpdates", label: "Product updates", description: "New features and improvements to FIZZ.", def: false },
  { key: "securityEmails", label: "Security alerts", description: "Password changes and sign-ins. Required for your protection.", def: true, locked: true },
] as const;

export function NotificationPrefsForm({ initial }: { initial: Record<string, boolean> }) {
  const [values, setValues] = useState<Record<string, boolean>>(() => Object.fromEntries(ITEMS.map((i) => [i.key, initial[i.key] ?? i.def])));
  return (
    <SettingsSection title="Email notifications">
      {ITEMS.map((item) => (
        <SettingsRow key={item.key} label={item.label} description={item.description}>
          <Switch
            checked={values[item.key]}
            disabled={"locked" in item && item.locked}
            aria-label={item.label}
            onCheckedChange={async (checked) => {
              setValues((v) => ({ ...v, [item.key]: checked }));
              try {
                await apiFetch("/api/account/preferences", { method: "PATCH", body: { notifications: { [item.key]: checked } } });
              } catch {
                toast.error("Could not save");
                setValues((v) => ({ ...v, [item.key]: !checked }));
              }
            }}
          />
        </SettingsRow>
      ))}
    </SettingsSection>
  );
}
