import { handleChat } from "../../netlify/lib/ai-chat-core.mjs";
import { env } from "../../netlify/lib/util.mjs";
import { clientIp, quotaCounter } from "../../netlify/lib/vercel-adapter.mjs";

export const maxDuration = 300;
export function POST(req) {
  return handleChat(req, { env, ip: clientIp(req), bump: quotaCounter(env) });
}
export const GET = POST;
