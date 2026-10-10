"use client";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Laptop, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/misc";
import { SettingsSection } from "./section";
import { apiFetch } from "@/lib/api-client";
import { relativeTime } from "@/lib/utils";

type S = { id: string; createdAt: string; lastSeenAt: string; expiresAt: string; ipAddress: string | null; userAgent: string | null; authMethod: string };

function describeAgent(ua: string | null) {
  if (!ua) return { name: "Unknown device", mobile: false };
  const mobile = /Mobile|Android|iPhone|iPad/i.test(ua);
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "macOS" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Linux/.test(ua) ? "Linux" : "";
  return { name: `${browser}${os ? ` on ${os}` : ""}`, mobile };
}

export function SessionsList() {
  const [data, setData] = useState<{ currentId: string; sessions: S[] } | null>(null);
  const load = useCallback(() => apiFetch<{ currentId: string; sessions: S[] }>("/api/account/sessions").then(setData).catch(() => toast.error("Could not load sessions")), []);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <SettingsSection
      title="Active sessions"
      footer={
        <Button
          variant="outline"
          size="sm"
          disabled={!data || data.sessions.length <= 1}
          onClick={async () => {
            await apiFetch("/api/account/sessions/revoke-others", { method: "POST" });
            toast.success("Signed out of other sessions");
            void load();
          }}
        >
          Sign out of all other sessions
        </Button>
      }
    >
      {!data ? (
        <div className="space-y-3">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {data.sessions.map((s) => {
            const agent = describeAgent(s.userAgent);
            const Icon = agent.mobile ? Smartphone : Laptop;
            const current = s.id === data.currentId;
            return (
              <li key={s.id} className="flex items-center gap-3 py-3">
                <Icon className="size-5 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    {agent.name} {current && <Badge variant="success">This device</Badge>}
                    {s.authMethod === "oidc" && <Badge variant="primary">SSO</Badge>}
                  </p>
                  <p className="text-[13px] text-muted-foreground">
                    Active {relativeTime(s.lastSeenAt)} · Signed in {relativeTime(s.createdAt)}
                    {s.ipAddress && s.ipAddress !== "local" ? ` · ${s.ipAddress}` : ""}
                  </p>
                </div>
                {!current && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      await apiFetch(`/api/account/sessions/${s.id}`, { method: "DELETE" });
                      toast.success("Session signed out");
                      void load();
                    }}
                  >
                    Sign out
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </SettingsSection>
  );
}
