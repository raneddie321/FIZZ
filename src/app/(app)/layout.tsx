import { requirePageAuth } from "@/server/auth/session";
import { getEffectivePlan } from "@/server/billing/subscriptions";
import { UserProvider } from "@/components/app/user-context";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requirePageAuth();
  const plan = await getEffectivePlan(user.id);
  return (
    <UserProvider
      user={{
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        role: user.role,
        emailVerified: Boolean(user.emailVerifiedAt),
        planKey: plan.key,
        planName: plan.name,
      }}
    >
      {children}
    </UserProvider>
  );
}
