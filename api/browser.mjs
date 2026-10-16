import { Sandbox } from "@vercel/sandbox";
import handler from "../netlify/functions/browser.mjs";
import { setSandboxModule } from "../netlify/lib/sandbox.mjs";
import { route } from "../netlify/lib/vercel-adapter.mjs";

// Imported statically so Vercel bundles the SDK (FIZZ's own cloud browser runs in Vercel Sandbox).
setSandboxModule({ Sandbox });
export const { POST } = route(handler, []);
