import handler from "../../../netlify/functions/oauth.mjs";
import { route } from "../../../netlify/lib/vercel-adapter.mjs";
export const { GET, POST } = route(handler, ["provider", "action"]);
