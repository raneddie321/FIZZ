// Who is calling: the RanEddie ID user (Clerk session token), when RanEddie ID is configured.
import { clerkConfigured, sessionUser } from "./clerk.mjs";
import { error } from "./util.mjs";

/** Returns { userId } or an error Response. Without Clerk keys the deployment is single-user (userId "local"). */
export async function requireUser(req) {
  if (!clerkConfigured()) return { userId: "local" };
  try {
    const userId = await sessionUser(req);
    return userId ? { userId } : { response: error(401, "Sign in with RanEddie ID first.", "signed_out") };
  } catch (e) {
    console.error("[auth]", e);
    return { response: error(502, "Couldn't reach RanEddie ID. Please try again.") };
  }
}
