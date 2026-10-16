import handler from "../../netlify/functions/web.mjs";
import { route } from "../../netlify/lib/vercel-adapter.mjs";
export const { GET, POST } = route(handler, ["action"]);
