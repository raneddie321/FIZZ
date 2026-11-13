import { handleChat } from "../../netlify/lib/ai-chat-core.mjs";
import { env, unseal } from "../../netlify/lib/util.mjs";
import { clientIp, quotaCounter } from "../../netlify/lib/vercel-adapter.mjs";

export function POST(req) {
  // Fizz Code's cloud runner sends a sealed run token instead of coming from the page.
  const tok = req.headers.get("x-fizz-run");
  const run = tok ? unseal(tok) : null;
  if (tok && run?.kind !== "run") return new Response(JSON.stringify({ error: { code: "run_token", message: "The cloud run's token expired." } }), { status: 401, headers: { "Content-Type": "application/json" } });
  return handleChat(req, { env, ip: clientIp(req), bump: quotaCounter(env), run });
}
export const GET = POST;
