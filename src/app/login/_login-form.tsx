"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { LockKeyhole } from "lucide-react";
import { isLoggedIn, setLoggedIn, verifyCredentials } from "@/lib/auth/client";

export function LoginForm() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get("next") || "/";

  // 已登录访问 /login 时直接回跳
  useEffect(() => {
    if (isLoggedIn()) router.replace(next);
  }, [next, router]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!username || !password) return;
    setLoading(true);
    try {
      const ok = await verifyCredentials(username, password);
      if (!ok) {
        toast.error("用户名或密码错误");
        return;
      }
      setLoggedIn();
      router.replace(next);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <div className="flex items-center gap-2">
            <LockKeyhole className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base">登录</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="username">用户名</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
                autoComplete="username"
                spellCheck={false}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">密码</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                spellCheck={false}
              />
            </div>
            <Button type="submit" disabled={loading || !username || !password} className="w-full">
              {loading ? "验证中…" : "进入"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
