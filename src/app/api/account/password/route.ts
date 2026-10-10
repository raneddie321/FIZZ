import { z } from "zod";
import { route, json, parseJson } from "@/server/http";
import { requireApiAuth } from "@/server/auth/session";
import { changePassword } from "@/server/auth/service";
import { enforceRateLimit, LIMITS } from "@/server/ratelimit";

const body = z.object({ current: z.string().max(200).default(""), next: z.string() });

export const POST = route(async (req) => {
  const { user, session } = await requireApiAuth({ verified: false });
  enforceRateLimit(`password:${user.id}`, LIMITS.auth.limit, LIMITS.auth.windowMs);
  const input = await parseJson(req, body);
  await changePassword(user.id, input.current, input.next, session.id);
  return json({ ok: true });
});
