/* eslint-disable no-console */
// Usage: npm run admin:promote -- user@example.com [ADMIN|SUPERADMIN|SUPPORT]
import { PrismaClient, type Role } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const [email, roleArg = "ADMIN"] = process.argv.slice(2);
  if (!email) throw new Error("Usage: npm run admin:promote -- <email> [ADMIN|SUPERADMIN|SUPPORT]");
  const role = roleArg.toUpperCase() as Role;
  if (!["USER", "SUPPORT", "ADMIN", "SUPERADMIN"].includes(role)) throw new Error(`Unknown role ${roleArg}`);
  const user = await db.user.update({ where: { email: email.toLowerCase() }, data: { role } });
  await db.auditLog.create({ data: { userId: user.id, actorType: "SYSTEM", action: "admin.role_changed", metadata: { role, via: "cli" } } });
  console.log(`${user.email} is now ${role}.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
