import web from "../../netlify/functions/web.mjs";
import mcp from "../../netlify/functions/mcp.mjs";
import { route } from "../../netlify/lib/vercel-adapter.mjs";

// The Vercel Hobby plan allows 12 serverless functions per deployment, and FIZZ is at that
// limit — /api/mcp/* shares this function. vercel.json rewrites it here as action=mcp-<action>.
const handler = (req, context) => {
  const action = String(context.params.action || "");
  if (action.startsWith("mcp-")) return mcp(req, { ...context, params: { action: action.slice(4) } });
  return web(req, context);
};
export const { GET, POST } = route(handler, ["action"]);
