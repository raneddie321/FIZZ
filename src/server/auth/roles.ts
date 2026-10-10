import type { Role } from "@prisma/client";

const RANK: Record<Role, number> = { USER: 0, SUPPORT: 1, ADMIN: 2, SUPERADMIN: 3 };

export function hasRole(role: Role, minimum: Role): boolean {
  return RANK[role] >= RANK[minimum];
}

export function isStaff(role: Role) {
  return hasRole(role, "SUPPORT");
}
