import { z } from "zod";
import { route, json, parseJson, badRequest } from "@/server/http";
import { requireApiAuth, destroyCurrentSession } from "@/server/auth/session";
import { verifyPassword } from "@/server/crypto";
import { db } from "@/server/db";
import { deleteAccount } from "@/server/account";

const body = z.object({ confirm: z.literal("DELETE", { error: 'Type "DELETE" to confirm.' }), password: z.string().max(200).optional() });

export const POST = route(async (req) => {
  const { user } = await requireApiAuth({ verified: false });
  const input = await parseJson(req, body);
  const record = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { passwordHash: true } });
  if (record.passwordHash && !(await verifyPassword(input.password ?? "", record.passwordHash))) {
    throw badRequest("Your password is incorrect.");
  }
  await deleteAccount(user.id);
  await destroyCurrentSession();
  return json({ redirect: "/" });
});
