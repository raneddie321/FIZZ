import "server-only";
import { db } from "./db";
import { audit } from "./audit";
import { storage } from "./storage";

/**
 * Deletes a user's content and scrubs personal data. Financial ledger entries,
 * transactions and audit logs are retained (linked to an anonymized record)
 * because they may be subject to legal retention requirements.
 */
export async function deleteAccount(userId: string) {
  const attachments = await db.attachment.findMany({ where: { userId }, select: { storageKey: true } });
  for (const a of attachments) await storage().delete(a.storageKey).catch(() => undefined);
  await db.$transaction([
    db.attachment.deleteMany({ where: { userId } }),
    db.conversation.deleteMany({ where: { userId } }),
    db.project.deleteMany({ where: { ownerId: userId } }),
    db.session.deleteMany({ where: { userId } }),
    db.identityMapping.deleteMany({ where: { userId } }),
    db.connectedService.deleteMany({ where: { userId } }),
    db.verificationToken.deleteMany({ where: { userId } }),
    db.notification.deleteMany({ where: { userId } }),
    db.user.update({
      where: { id: userId },
      data: {
        email: `deleted+${userId}@deleted.invalid`,
        displayName: "Deleted user",
        avatarUrl: null,
        passwordHash: null,
        status: "DELETED",
        twoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorRecoveryCodes: [],
        preferences: {},
      },
    }),
  ]);
  await audit({ userId, action: "account.deleted" });
}
