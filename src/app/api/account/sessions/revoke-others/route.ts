import { route, json } from "@/server/http";
import { requireApiAuth, revokeOtherSessions } from "@/server/auth/session";
import { audit } from "@/server/audit";

export const POST = route(async () => {
  const { user, session } = await requireApiAuth({ verified: false });
  await revokeOtherSessions(user.id, session.id);
  await audit({ userId: user.id, action: "auth.sessions_revoked_others" });
  return json({ ok: true });
});
