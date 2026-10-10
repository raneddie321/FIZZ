"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Github } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { apiFetch } from "@/lib/api-client";
import { formatDate } from "@/lib/utils";

export function GitHubConnection({ connected }: { connected: { login: string; since: string } | null }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  if (connected) {
    return (
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Github className="size-5" />
          <div>
            <p className="text-sm font-medium">@{connected.login}</p>
            <p className="text-[13px] text-muted-foreground">Connected {formatDate(connected.since)}</p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            await apiFetch("/api/account/connections/github", { method: "DELETE" });
            toast.success("GitHub disconnected");
            router.refresh();
          }}
        >
          Disconnect
        </Button>
      </div>
    );
  }
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
          await apiFetch("/api/account/connections", { method: "POST", body: { service: "github", token: new FormData(e.currentTarget).get("token") } });
          toast.success("GitHub connected");
          router.refresh();
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Could not connect");
        } finally {
          setLoading(false);
        }
      }}
    >
      <Field
        label="Fine-grained personal access token"
        htmlFor="gh-token"
        hint={
          <>
            Create one at github.com → Settings → Developer settings → Fine-grained tokens, with <strong>Contents: Read and write</strong> access to the repositories you want to use.
          </>
        }
      >
        <Input id="gh-token" name="token" type="password" autoComplete="off" required placeholder="github_pat_…" />
      </Field>
      <Button type="submit" loading={loading}>
        <Github /> Connect GitHub
      </Button>
    </form>
  );
}
