import type { Metadata } from "next";
import { Toaster } from "sonner";
import { AuthGate } from "@/components/auth-gate";
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
        <AuthGate>{children}</AuthGate>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
