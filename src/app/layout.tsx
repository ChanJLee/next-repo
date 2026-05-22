import type { Metadata } from "next";
import { Toaster } from "sonner";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stock Monitor",
  description: "美股行情指标监控",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-background text-foreground">
        <header className="border-b">
          <div className="container flex h-14 items-center gap-6">
            <span className="font-semibold">📈 Stock Monitor</span>
            <nav className="flex gap-4 text-sm text-muted-foreground">
              <Link href="/" className="hover:text-foreground">总览</Link>
              <Link href="/watchlist" className="hover:text-foreground">监控列表</Link>
              <Link href="/settings" className="hover:text-foreground">设置</Link>
            </nav>
          </div>
        </header>
        <main className="container py-6">{children}</main>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
