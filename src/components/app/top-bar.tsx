import Link from "next/link";
import { FizzWordmark } from "@/components/brand";
import { ProductSwitcher } from "./product-switcher";
import { NotificationBell } from "./notification-bell";
import { UserMenu } from "./user-menu";

export function TopBar({ product = "fizz", children }: { product?: "fizz" | "dev"; children?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background/90 px-3 backdrop-blur sm:px-4">
      <Link href={product === "dev" ? "/dev" : "/chat"} className="rounded-md" aria-label="Home">
        <FizzWordmark product={product} />
      </Link>
      <ProductSwitcher className="ml-2 hidden sm:inline-flex" />
      <div className="flex-1">{children}</div>
      <NotificationBell />
      <UserMenu compact />
    </header>
  );
}
