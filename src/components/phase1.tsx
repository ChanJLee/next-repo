import Link from "next/link";
import type { ReactNode } from "react";

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
    <form action={action} className="mb-4 flex gap-2">
      <Input name="q" placeholder={placeholder} />
      <Button variant="secondary">搜索</Button>
    </form>
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
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  placeholder?: string;
}) {
  return (
    <label className="space-y-2 text-sm">
      <span className="font-medium">{label}</span>
      <Input
        defaultValue={defaultValue}
        name={name}
        placeholder={placeholder}
        type={type}
      />
    </label>
  );
}

export function SelectField({
  label,
  name,
  children,
}: {
  label: string;
  name: string;
  children: ReactNode;
}) {
  return (
    <label className="space-y-2 text-sm">
      <span className="font-medium">{label}</span>
      <Select name={name}>{children}</Select>
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
