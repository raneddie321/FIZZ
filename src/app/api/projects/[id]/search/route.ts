import { route, json } from "@/server/http";
import { requireApiAuth } from "@/server/auth/session";
import { getOwnedProject, searchFiles } from "@/server/projects/files";

export const GET = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const { id } = await params;
  const { user } = await requireApiAuth();
  await getOwnedProject(user.id, id);
  const sp = new URL(req.url).searchParams;
  const result = await searchFiles(id, (sp.get("q") ?? "").slice(0, 500), {
    regex: sp.get("regex") === "1",
    caseSensitive: sp.get("case") === "1",
    limit: 500,
  });
  return json(result);
});
