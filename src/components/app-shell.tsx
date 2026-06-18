import Link from "next/link";
import { Settings } from "lucide-react";
import { StooqApikeyBanner } from "@/components/stooq-apikey-banner";
import { LogoutButton } from "@/components/logout-button";

/** 登录后的应用外壳：顶栏导航 + 主内容区。 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="border-b">
        <div className="container flex h-14 items-center gap-6">
          <Link href="/" className="font-semibold hover:opacity-80">📈 Stock Monitor</Link>
          <div className="flex flex-1 items-center justify-end gap-4">
            <Link
              href="/settings"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
              title="设置"
            >
              <Settings className="h-4 w-4" />
              <span>设置</span>
            </Link>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="container py-6 space-y-4">
        <StooqApikeyBanner />
        {children}
      </main>
    </>
  );
}
