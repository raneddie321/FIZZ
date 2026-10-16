import { error, json, readJson, sameOrigin } from "../lib/util.mjs";
import { clerkConfigured, emailTaken } from "../lib/clerk.mjs";

/** Sign-up step 1: does this email already have a RanEddie ID? */
export default async (req) => {
  if (!clerkConfigured()) return error(503, "RanEddie ID isn't configured on this server yet.", "not_configured");
  if (req.method !== "POST") return error(405, "Method not allowed.");
  if (!sameOrigin(req)) return error(403, "Not allowed.");
  try {
    const body = await readJson(req, 1000);
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254) return error(400, "Enter a valid email address.", "bad_email");
    return json({ taken: await emailTaken(email) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[email-taken]", e);
    return error(e.status || 500, e.message || "Something went wrong.");
  }
};

export const config = { path: "/api/email-taken" };
