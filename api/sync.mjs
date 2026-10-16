import handler from "../netlify/functions/sync.mjs";
import { route } from "../netlify/lib/vercel-adapter.mjs";
export const { GET, PUT, DELETE } = route(handler, []);
