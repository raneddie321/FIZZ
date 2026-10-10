"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Avatar } from "@/components/ui/avatar";
import { apiFetch } from "@/lib/api-client";

export function ProfileForm({ displayName, avatarUrl }: { displayName: string; avatarUrl: string }) {
  const router = useRouter();
  const [name, setName] = useState(displayName);
  const [avatar, setAvatar] = useState(avatarUrl);
  const [loading, setLoading] = useState(false);
  const dirty = name !== displayName || avatar !== avatarUrl;
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
          await apiFetch("/api/account/profile", { method: "PATCH", body: { displayName: name, avatarUrl: avatar } });
          toast.success("Profile updated");
          router.refresh();
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Could not update profile");
        } finally {
          setLoading(false);
        }
      }}
    >
      <div className="flex items-center gap-4">
        <Avatar name={name || "?"} src={avatar || null} className="size-14 text-lg" />
        <p className="text-sm text-muted-foreground">Your initials are shown unless you set a profile image URL.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Display name" htmlFor="displayName">
          <Input id="displayName" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />
        </Field>
        <Field label="Profile image URL" htmlFor="avatarUrl" hint="Optional. Must start with https://">
          <Input id="avatarUrl" value={avatar} onChange={(e) => setAvatar(e.target.value)} placeholder="https://…" type="url" />
        </Field>
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={!dirty} loading={loading}>
          Save changes
        </Button>
      </div>
    </form>
  );
}
