import handler from "../../../netlify/functions/connector.mjs";
import { route } from "../../../netlify/lib/vercel-adapter.mjs";
export const { GET, POST } = route(handler, ["service", "action"]);
