import Link from "next/link";

import { SafeForm } from "@/components/safe-form";
import { Button, Card, Input } from "@/components/ui";
import { registerAction } from "@/server/auth/actions";

const errorText: Record<string, string> = {
  duplicate: "注册失败，请检查用户名是否已存在",
  invalid: "请输入有效的姓名、用户名和密码",
};

export default async function RegisterPage({
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
            注册演示账号
          </h1>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            新账号会加入演示租户，便于继续验证业务流程。
          </p>
        </div>
        <SafeForm action={registerAction} className="mt-6 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="name">
              姓名
            </label>
            <Input id="name" name="name" required />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="username">
              用户名
            </label>
            <Input autoComplete="username" id="username" name="username" required />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="password">
              密码
            </label>
            <Input
              autoComplete="new-password"
              id="password"
              minLength={6}
              name="password"
              required
              type="password"
            />
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <Button className="w-full">注册并登录</Button>
        </SafeForm>
        <p className="mt-4 text-center text-sm text-zinc-500 dark:text-zinc-400">
          已有账号？{" "}
          <Link className="font-medium text-zinc-950 dark:text-zinc-50" href="/login">
            返回登录
          </Link>
        </p>
      </Card>
    </main>
  );
}
