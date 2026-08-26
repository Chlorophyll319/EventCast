import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getSessionUserId } from "@/lib/serverSession";
import { LogoutButton } from "./LogoutButton";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const userId = await getSessionUserId();
  if (!userId) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-6">
          <span className="font-semibold">EventCast</span>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/dashboard/pages" className="underline">
              活動頁
            </Link>
            <Link href="/dashboard/tokens" className="underline">
              API Tokens
            </Link>
          </nav>
        </div>
        <LogoutButton />
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
