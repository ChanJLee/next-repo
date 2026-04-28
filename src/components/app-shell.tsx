import { AppNavigation } from "./app-navigation";
import { AppRouteTitle } from "./app-route-title";
import { logoutAction } from "@/server/auth/actions";
import type { SessionPayload } from "@/server/auth/session";
import { Badge, Button } from "./ui";

const navigation = [
  { label: "经营驾驶舱", href: "/" },
  { label: "配件主数据", href: "/master/parts" },
  { label: "机型库", href: "/master/machines" },
  { label: "客户档案", href: "/master/customers" },
  { label: "客户机器", href: "/master/customer-machines" },
  { label: "供应商", href: "/master/suppliers" },
  { label: "仓库库位", href: "/master/warehouses" },
  { label: "农时日历", href: "/master/seasons" },
  { label: "库存查询", href: "/inventory" },
  { label: "出入库流水", href: "/inventory/transactions" },
  { label: "采购订单", href: "/purchase/orders" },
  { label: "销售订单", href: "/sales/orders" },
  { label: "应收账款", href: "/finance/receivables" },
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
        <AppNavigation items={navigation} />
      </aside>
      <div className="lg:pl-64">
        <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/80 px-6 py-3 backdrop-blur dark:border-zinc-800 dark:bg-black/80">
          <div className="flex items-center justify-between gap-4">
            <AppRouteTitle items={navigation} />
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
