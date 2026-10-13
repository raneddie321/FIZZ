import handler from "../netlify/functions/account.mjs";
import { route } from "../netlify/lib/vercel-adapter.mjs";
export const { GET, POST, PUT } = route(handler, []);
