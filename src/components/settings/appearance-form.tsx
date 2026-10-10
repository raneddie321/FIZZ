"use client";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Monitor, Moon, Sun } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert } from "@/components/ui/misc";
import { SettingsSection } from "./section";
import { apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";

const LANGUAGES = [
  ["en", "English"], ["es", "Español"], ["fr", "Français"], ["de", "Deutsch"], ["pt", "Português"], ["it", "Italiano"],
  ["nl", "Nederlands"], ["ja", "日本語"], ["ko", "한국어"], ["zh", "中文"], ["ar", "العربية"], ["hi", "हिन्दी"],
] as const;

export function AppearanceForm({ language }: { language: string }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [lang, setLang] = useState(language);
  useEffect(() => setMounted(true), []);

  const save = (body: Record<string, unknown>) => apiFetch("/api/account/preferences", { method: "PATCH", body }).then(() => toast.success("Saved")).catch(() => toast.error("Could not save"));

  return (
    <>
      <SettingsSection title="Theme" description="Choose how FIZZ looks on this device.">
        <div className="grid grid-cols-3 gap-3 sm:max-w-md" role="radiogroup" aria-label="Theme">
          {[
            { v: "light", label: "Light", icon: Sun },
            { v: "dark", label: "Dark", icon: Moon },
            { v: "system", label: "System", icon: Monitor },
          ].map((t) => (
            <button
              key={t.v}
              role="radio"
              aria-checked={mounted && theme === t.v}
              onClick={() => {
                setTheme(t.v);
                void save({ theme: t.v });
              }}
              className={cn(
                "flex flex-col items-center gap-2 rounded-xl border border-border p-4 text-sm transition-colors hover:bg-accent",
                mounted && theme === t.v && "border-primary ring-1 ring-primary/30",
              )}
            >
              <t.icon className="size-5" />
              {t.label}
            </button>
          ))}
        </div>
      </SettingsSection>
      <SettingsSection title="Language" description="FIZZ will reply in your preferred language unless you ask otherwise.">
        <div className="space-y-3 sm:max-w-xs">
          <Select
            value={lang}
            onValueChange={(v) => {
              setLang(v);
              void save({ language: v });
            }}
          >
            <SelectTrigger aria-label="Language">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGES.map(([code, name]) => (
                <SelectItem key={code} value={code}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Alert className="mt-4">The FIZZ interface is currently available in English. Your language preference is used for AI responses.</Alert>
      </SettingsSection>
    </>
  );
}
