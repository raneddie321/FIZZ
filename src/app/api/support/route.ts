import { z } from "zod";
import { route, json, parseJson, clientIp } from "@/server/http";
import { getAuth, requireApiAuth } from "@/server/auth/session";
import { enforceRateLimit, LIMITS } from "@/server/ratelimit";
import { db } from "@/server/db";
import { audit } from "@/server/audit";

const body = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(80),
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address.")),
  subject: z.string().trim().min(3, "Add a subject.").max(140),
  message: z.string().trim().min(10, "Tell us a little more (at least 10 characters).").max(5000),
  category: z.enum(["general", "account", "billing", "wallet", "technical", "abuse"]).default("general"),
});

export const POST = route(async (req) => {
  enforceRateLimit(`support:${clientIp(req)}`, LIMITS.contact.limit, LIMITS.contact.windowMs);
  const auth = await getAuth();
  const input = await parseJson(req, body);
  const request = await db.supportRequest.create({
    data: { ...input, userId: auth?.user.id, priority: input.category === "abuse" ? "high" : "normal" },
  });
  await audit({ userId: auth?.user.id, action: "support.request_created", targetType: "SupportRequest", targetId: request.id });
  return json({ id: request.id });
});

export const GET = route(async () => {
  const { user } = await requireApiAuth({ verified: false });
  const requests = await db.supportRequest.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { replies: { orderBy: { createdAt: "asc" } } },
  });
  return json({ requests });
});
