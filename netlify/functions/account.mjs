import { error, json, readJson, sameOrigin } from "../lib/util.mjs";
import { clerkConfigured, readFizz, sessionUser, writeFizz } from "../lib/clerk.mjs";

/** FIZZ settings saved in the signed-in user's RanEddie ID (privateMetadata.fizz). */
export default async (req) => {
  if (!clerkConfigured()) return error(503, "RanEddie ID isn't configured on this server yet.", "not_configured");
  if (!sameOrigin(req)) return error(403, "Not allowed.");
  let userId;
  try {
    userId = await sessionUser(req);
  } catch (e) {
    console.error("[account] verify", e);
    return error(502, "Couldn't reach RanEddie ID. Please try again.");
  }
  if (!userId) return error(401, "Sign in with RanEddie ID first.", "signed_out");
  try {
    if (req.method === "GET") return json({ fizz: await readFizz(userId) });
    if (req.method === "PUT" || req.method === "POST") {
      const body = await readJson(req, 4000);
      return json({ fizz: await writeFizz(userId, body.fizz) });
    }
    return error(405, "Method not allowed.");
  } catch (e) {
    console.error("[account]", e);
    return error(e.status || 500, e.message || "Something went wrong.");
  }
};

export const config = { path: "/api/account" };
