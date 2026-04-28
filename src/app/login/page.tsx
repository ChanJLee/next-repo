import Link from "next/link";

import { Button, Card, Input } from "@/components/ui";
import { loginAction } from "@/server/auth/actions";

const errorText: Record<string, string> = {
  credentials: "用户名或密码不正确",
  invalid: "请输入有效的用户名和密码",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const error = params?.error ? errorText[params.error] : null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 dark:bg-black">
      <Card className="w-full max-w-sm">
        <div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            农机配件 ERP
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            登录工作台
          </h1>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            演示账号：admin / demo123456
          </p>
        </div>
        <form action={loginAction} className="mt-6 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="username">
              用户名
            </label>
            <Input
              autoComplete="username"
              defaultValue="admin"
              id="username"
              name="username"
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="password">
              密码
            </label>
            <Input
              autoComplete="current-password"
              defaultValue="demo123456"
              id="password"
              name="password"
              required
              type="password"
            />
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <Button className="w-full">登录</Button>
        </form>
        <p className="mt-4 text-center text-sm text-zinc-500 dark:text-zinc-400">
          还没有账号？{" "}
          <Link className="font-medium text-zinc-950 dark:text-zinc-50" href="/register">
            注册演示账号
          </Link>
        </p>
      </Card>
    </main>
  );
}
