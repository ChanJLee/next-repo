"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { isAuthConfigured, isLoggedIn } from "@/lib/auth/client";
import { AppShell } from "@/components/app-shell";

type Phase = "checking" | "authed" | "anon";

/**
 * 纯前端登录门：
 * - /login 始终原样渲染（裸页，不套外壳）。
 * - 其他路径：已登录 → 套 AppShell 渲染；未登录 → 跳 /login。
 * - 判定完成前渲染 null，避免未登录时闪现受保护内容（SSR 阶段也输出 null）。
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("checking");

  useEffect(() => {
    if (pathname === "/login") return;
    if (!isAuthConfigured() || isLoggedIn()) {
      setPhase("authed");
      return;
    }
    setPhase("anon");
    const next = encodeURIComponent(pathname || "/");
    router.replace(`/login?next=${next}`);
  }, [pathname, router]);

  if (pathname === "/login") return <>{children}</>;
  if (phase !== "authed") return null;
  return <AppShell>{children}</AppShell>;
}
