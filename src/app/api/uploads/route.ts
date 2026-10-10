import { route, json, badRequest } from "@/server/http";
import { requireApiAuth } from "@/server/auth/session";
import { enforceRateLimit, LIMITS } from "@/server/ratelimit";
import { publicAttachment, saveUpload } from "@/server/uploads";

export const POST = route(async (req) => {
  const { user } = await requireApiAuth();
  enforceRateLimit(`upload:${user.id}`, LIMITS.upload.limit, LIMITS.upload.windowMs);
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw badRequest("Upload must be multipart form data.");
  }
  const file = form.get("file");
  if (!(file instanceof File)) throw badRequest("No file was provided.");
  const conversationId = typeof form.get("conversationId") === "string" ? (form.get("conversationId") as string) || null : null;
  const attachment = await saveUpload(user.id, file, { conversationId });
  return json({ attachment: publicAttachment(attachment) });
});
