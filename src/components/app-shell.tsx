import Link from "next/link";

import { logoutAction } from "@/server/auth/actions";
import type { SessionPayload } from "@/server/auth/session";
import { Badge, Breadcrumb, Button } from "./ui";

const navigation = [
  ["经营驾驶舱", "/"],
  ["配件主数据", "/master/parts"],
  ["机型库", "/master/machines"],
  ["客户档案", "/master/customers"],
  ["客户机器", "/master/customer-machines"],
  ["供应商", "/master/suppliers"],
  ["仓库库位", "/master/warehouses"],
  ["农时日历", "/master/seasons"],
  ["库存查询", "/inventory"],
  ["出入库流水", "/inventory/transactions"],
  ["采购订单", "/purchase/orders"],
  ["销售订单", "/sales/orders"],
  ["应收账款", "/finance/receivables"],
];

export function AppShell({
  children,
  session,
}: {
  children: React.ReactNode;
  session: SessionPayload;
}) {
  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-950 dark:bg-black dark:text-zinc-50">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950 lg:block">
        <div className="flex h-12 items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-xl bg-zinc-950 text-sm font-semibold text-white dark:bg-zinc-50 dark:text-zinc-950">
            SB
          </div>
          <div>
            <p className="text-sm font-semibold">农机配件 ERP</p>
            <p className="text-xs text-zinc-500">Phase 1 MVP</p>
          </div>
        </div>
        <nav className="mt-8 space-y-1">
          {navigation.map(([item, href], index) => (
            <Link
              className={[
                "flex h-9 items-center rounded-lg px-3 text-sm transition-colors",
                index === 0
                  ? "bg-zinc-100 font-medium text-zinc-950 dark:bg-zinc-900 dark:text-zinc-50"
                  : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-950 dark:hover:bg-zinc-900 dark:hover:text-zinc-50",
              ].join(" ")}
              href={href}
              key={item}
            >
              {item}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="lg:pl-64">
        <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/80 px-6 py-3 backdrop-blur dark:border-zinc-800 dark:bg-black/80">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Breadcrumb items={["首页", "经营驾驶舱"]} />
              <h1 className="mt-1 text-lg font-semibold">经营驾驶舱</h1>
            </div>
            <div className="flex items-center gap-3">
              <button className="hidden h-9 min-w-56 rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-left text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 md:block">
                ⌘K 搜索命令、单据、客户
              </button>
              <Badge>{session.name}</Badge>
              <form action={logoutAction}>
                <Button variant="secondary">退出</Button>
              </form>
            </div>
          </div>
        </header>
        <main className="px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
