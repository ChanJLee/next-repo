"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { logout as clearAuth } from "@/lib/auth/client";

export function LogoutButton() {
  const router = useRouter();

  function logout() {
    clearAuth();
    router.replace("/login");
  }

  return (
    <button
      onClick={logout}
      className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
      title="退出登录"
    >
      <LogOut className="h-4 w-4" />
      <span>退出</span>
    </button>
  );
}
