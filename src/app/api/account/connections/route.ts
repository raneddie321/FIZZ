import { z } from "zod";
import { route, json, parseJson, badRequest } from "@/server/http";
import { requireApiAuth } from "@/server/auth/session";
import { db } from "@/server/db";
import { encrypt } from "@/server/crypto";
import { audit } from "@/server/audit";
import { githubWhoAmI } from "@/server/git/github";

export const GET = route(async () => {
  const { user } = await requireApiAuth();
  const services = await db.connectedService.findMany({
    where: { userId: user.id },
    select: { id: true, service: true, accountLabel: true, scopes: true, createdAt: true },
  });
  return json({ services });
});

const body = z.object({ service: z.literal("github"), token: z.string().trim().min(20).max(255) });

/** Connects GitHub with a fine-grained personal access token (stored encrypted). */
export const POST = route(async (req) => {
  const { user } = await requireApiAuth();
  const input = await parseJson(req, body);
  const who = await githubWhoAmI(input.token).catch(() => null);
  if (!who) throw badRequest("GitHub rejected that token. Check that it's valid and hasn't expired.");
  await db.connectedService.upsert({
    where: { userId_service: { userId: user.id, service: "github" } },
    create: { userId: user.id, service: "github", accountLabel: who.login, encryptedToken: encrypt(input.token), scopes: who.scopes },
    update: { accountLabel: who.login, encryptedToken: encrypt(input.token), scopes: who.scopes },
  });
  await audit({ userId: user.id, action: "account.service_connected", metadata: { service: "github", login: who.login } });
  return json({ ok: true, accountLabel: who.login });
});
