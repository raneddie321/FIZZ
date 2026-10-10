import { z } from "zod";
import { route, json, parseJson, notFound } from "@/server/http";
import { requireApiAuth } from "@/server/auth/session";
import { db } from "@/server/db";
import { isStaff } from "@/server/auth/roles";
import { notify } from "@/server/notifications";

const body = z.object({ body: z.string().trim().min(1).max(5000), status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]).optional() });

export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const { id } = await params;
  const { user } = await requireApiAuth({ verified: false });
  const request = await db.supportRequest.findUnique({ where: { id } });
  const staff = isStaff(user.role);
  if (!request || (!staff && request.userId !== user.id)) throw notFound();
  const input = await parseJson(req, body);
  const reply = await db.supportReply.create({ data: { requestId: id, authorId: user.id, isStaff: staff, body: input.body } });
  await db.supportRequest.update({
    where: { id },
    data: { status: staff && input.status ? input.status : staff ? "IN_PROGRESS" : "OPEN" },
  });
  if (staff && request.userId) {
    await notify(request.userId, { type: "support", title: "Support replied to your request", body: request.subject, link: "/support" });
  }
  return json({ reply });
});
