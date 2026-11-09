// Who is calling: the RanEddie ID user (Clerk session token), when RanEddie ID is configured.
import { clerkConfigured, sessionUser } from "./clerk.mjs";
import { createHash } from "node:crypto";
import { error } from "./util.mjs";

/** Returns { userId } or an error Response. Without Clerk keys each browser is its own user. */
export async function requireUser(req) {
  // Without RanEddie ID on the server, each browser is its own user (a random device id), so people never share a
  // cloud browser, sandbox or limits.
  if (!clerkConfigured()) {
    const device = req.headers.get("x-fizz-device") || "";
    if (!/^[a-f0-9]{32}$/.test(device)) return { response: error(400, "Refresh the page and try again.", "no_device") };
    return { userId: `device-${createHash("sha256").update(device).digest("hex").slice(0, 24)}` };
  }
  try {
    const userId = await sessionUser(req);
    return userId ? { userId } : { response: error(401, "Sign in with RanEddie ID first.", "signed_out") };
  } catch (e) {
    console.error("[auth]", e);
    return { response: error(502, "Couldn't reach RanEddie ID. Please try again.") };
  }
}
