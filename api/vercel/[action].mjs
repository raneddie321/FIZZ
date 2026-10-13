import handler from "../../netlify/functions/vercel.mjs";
import { route } from "../../netlify/lib/vercel-adapter.mjs";
export const { GET, POST, PUT, DELETE } = route(handler, ["action"]);
