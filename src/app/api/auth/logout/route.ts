import { route, json } from "@/server/http";
import { destroyCurrentSession, getRawSession } from "@/server/auth/session";
import { endSessionUrl } from "@/server/auth/oidc";
import { audit } from "@/server/audit";

export const POST = route(async () => {
  const ctx = await getRawSession();
  const providerLogout = ctx?.session.authMethod === "oidc" ? await endSessionUrl() : null;
  if (ctx) await audit({ userId: ctx.user.id, action: "auth.logout" });
  await destroyCurrentSession();
  return json({ redirect: providerLogout ?? "/" });
});
