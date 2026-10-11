import { route, json } from "@/server/http";
import { requireApiAuth } from "@/server/auth/session";
import { publicTemplates } from "@/server/projects/templates";

export const GET = route(async () => {
  await requireApiAuth();
  return json({ templates: publicTemplates() });
});
