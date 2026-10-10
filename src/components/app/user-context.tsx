"use client";
import { createContext, useContext } from "react";

export type ClientUser = {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  role: "USER" | "SUPPORT" | "ADMIN" | "SUPERADMIN";
  emailVerified: boolean;
  planKey: string;
  planName: string;
};

const UserContext = createContext<ClientUser | null>(null);

export function UserProvider({ user, children }: { user: ClientUser; children: React.ReactNode }) {
  return <UserContext.Provider value={user}>{children}</UserContext.Provider>;
}

export function useUser(): ClientUser {
  const user = useContext(UserContext);
  if (!user) throw new Error("useUser must be used inside UserProvider");
  return user;
}

export function isStaffRole(role: ClientUser["role"]) {
  return role !== "USER";
}
