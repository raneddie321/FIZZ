import handler from "../netlify/functions/email-taken.mjs";
import { route } from "../netlify/lib/vercel-adapter.mjs";
export const { GET, POST, PUT } = route(handler, []);
