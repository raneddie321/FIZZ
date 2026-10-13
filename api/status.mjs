import handler from "../netlify/functions/status.mjs";
import { route } from "../netlify/lib/vercel-adapter.mjs";
export const { GET } = route(handler, []);
