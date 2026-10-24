import handler from "../../netlify/functions/mcp.mjs";
import { route } from "../../netlify/lib/vercel-adapter.mjs";
export const { GET, POST } = route(handler, ["action"]);
