import { z } from "zod";
import { route, json, parseJson } from "@/server/http";
import { requireApiAuth } from "@/server/auth/session";
import { stopGeneration } from "@/server/chat/generate";

const body = z.object({ messageId: z.string().max(40) });

export const POST = route(async (req) => {
  const { user } = await requireApiAuth();
  const { messageId } = await parseJson(req, body);
  return json({ stopped: stopGeneration(messageId, user.id) });
});
