import handler from "../netlify/functions/browser.mjs";
import { route } from "../netlify/lib/vercel-adapter.mjs";
export const { POST } = route(handler, []);
