import { route, json } from "@/server/http";
import { requireApiAuth } from "@/server/auth/session";
import { getOwnedProject } from "@/server/projects/files";
import { signToken } from "@/server/crypto";
import { env } from "@/server/env";

/**
 * Issues a short-lived capability token for the live preview. Previews are served from
 * /preview/<token>/... with a sandboxing CSP, so preview scripts run in an opaque origin
 * and never see the user's session cookie.
 */
export const POST = route<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  const { id } = await params;
  const { user } = await requireApiAuth();
  await getOwnedProject(user.id, id);
  const token = signToken({ p: id, u: user.id }, 4 * 60 * 60);
  const base = env().PREVIEW_ORIGIN ?? "";
  return json({ token, baseUrl: `${base}/preview/${token}/` });
});
