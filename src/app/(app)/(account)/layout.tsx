import { TopBar } from "@/components/app/top-bar";
import { AccountNav, AccountNavMobile } from "@/components/app/account-nav";

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar />
      <div className="mx-auto flex w-full max-w-6xl flex-1 gap-10 px-4 py-6 sm:px-6 lg:py-10">
        <aside className="hidden w-60 shrink-0 lg:block">
          <div className="sticky top-24">
            <AccountNav />
          </div>
        </aside>
        <main id="main" className="min-w-0 flex-1 space-y-6">
          <AccountNavMobile />
          {children}
        </main>
      </div>
    </div>
  );
}
