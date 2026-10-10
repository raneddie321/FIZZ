import "server-only";
import { db } from "./db";

export type ActorType = "USER" | "AGENT" | "SYSTEM" | "ADMIN";

export async function audit(entry: {
  userId?: string | null;
  actorType?: ActorType;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
}) {
  try {
    await db.auditLog.create({
      data: {
        userId: entry.userId ?? null,
        actorType: entry.actorType ?? "USER",
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId,
        metadata: JSON.parse(JSON.stringify(entry.metadata ?? {})),
        ipAddress: entry.ipAddress,
      },
    });
  } catch (error) {
    console.error("[audit] failed to write audit log", error);
  }
}
