import Link from "next/link";
import type { ReactNode } from "react";

import { SafeForm } from "@/components/safe-form";
import { Badge, Button, Card, Input, Select, Table, Tabs } from "@/components/ui";
import { cn } from "@/lib/cn";

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          {description}
        </p>
      </div>
      {action}
    </div>
  );
}

export function SearchBar({
  action,
  placeholder = "搜索编码、名称",
}: {
  action?: string;
  placeholder?: string;
}) {
  return (
    <SafeForm action={action} className="mb-4 flex gap-2">
      <Input name="q" placeholder={placeholder} />
      <Button variant="secondary">搜索</Button>
    </SafeForm>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const labels: Record<string, string> = {
    ACTIVE: "启用",
    DRAFT: "草稿",
    PENDING: "待审核",
    APPROVED: "已审核",
    RECEIVED: "已入库",
    SHIPPED: "已出库",
    OPEN: "待收款",
    PARTIAL: "部分收款",
    PAID: "已结清",
    REPORTED: "待派单",
    DISPATCHED: "已派单",
    ACCEPTED: "已接单",
    IN_SERVICE: "服务中",
    COMPLETED: "已完成",
    CLOSED: "已关闭",
    GENERATED: "已生成",
    CONFIRMED: "已确认",
    CONVERTED: "已转单",
    REGION_REVIEW: "区域审核",
    OEM_REVIEW: "整机厂审核",
    SETTLED: "已结算",
    SUBMITTED: "已申报",
    PAID_SUBSIDY: "已拨付",
  };

  return <Badge>{labels[status] ?? status}</Badge>;
}

export function DetailTabs() {
  return (
    <div className="mb-4">
      <Tabs items={["基本信息", "关联单据", "流水", "操作日志"]} />
    </div>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
      <div className="mt-1 text-sm font-medium">{children}</div>
    </div>
  );
}

export function FormCard({ children }: { children: ReactNode }) {
  return <Card className="max-w-3xl space-y-4">{children}</Card>;
}

export function FormGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 md:grid-cols-2">{children}</div>;
}

export function FormField({
  label,
  name,
  type = "text",
  defaultValue,
  placeholder,
  error,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  placeholder?: string;
  /** 校验失败时在控件下方展示 */
  error?: string;
}) {
  return (
    <label className="space-y-2 text-sm">
      <span className="font-medium">{label}</span>
      <Input
        aria-invalid={error ? true : undefined}
        className={cn(
          error &&
            "border-red-500 focus:border-red-500 dark:border-red-600 dark:focus:border-red-500",
        )}
        defaultValue={defaultValue}
        name={name}
        placeholder={placeholder}
        type={type}
      />
      {error ? (
        <p className="text-xs text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : null}
    </label>
  );
}

export function SelectField({
  label,
  name,
  children,
  error,
}: {
  label: string;
  name: string;
  children: ReactNode;
  error?: string;
}) {
  return (
    <label className="space-y-2 text-sm">
      <span className="font-medium">{label}</span>
      <Select
        aria-invalid={error ? true : undefined}
        className={cn(
          error &&
            "border-red-500 focus:border-red-500 dark:border-red-600 dark:focus:border-red-500",
        )}
        name={name}
      >
        {children}
      </Select>
      {error ? (
        <p className="text-xs text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      ) : null}
    </label>
  );
}

export function LinkButton({
  href,
  children,
  variant = "primary",
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
}) {
  return (
    <Link
      className={cn(
        "inline-flex h-9 items-center justify-center rounded-lg px-4 text-sm font-medium transition-colors",
        variant === "primary" &&
          "bg-zinc-950 text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200",
        variant === "secondary" &&
          "border border-zinc-200 bg-white text-zinc-950 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:hover:bg-zinc-900",
        variant === "ghost" &&
          "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900",
      )}
      href={href}
    >
      {children}
    </Link>
  );
}

export { Button, Card, Input, Select, Table };
