import {
  Badge,
  Card,
  EmptyState,
  Select,
  Skeleton,
  Table,
  Tabs,
} from "@/components/ui";
import { getCurrentSession } from "@/server/auth/current-session";
import { getDashboardMetrics, listSalesOrders } from "@/server/phase1/service";

export default async function DashboardPage() {
  const session = await getCurrentSession();
  const dashboard = session
    ? getDashboardMetrics(session)
    : {
        salesAmount: "0.00",
        inventoryValue: "0.00",
        receivableAmount: "0.00",
        pendingShipments: 0,
      };
  const salesOrders = session ? listSalesOrders(session).slice(0, 5) : [];
  const metrics = [
    ["累计销售额", `¥ ${dashboard.salesAmount}`, "来自已出库销售订单"],
    ["库存总值", `¥ ${dashboard.inventoryValue}`, "按库存余额 × 平均成本聚合"],
    ["待发货", `${dashboard.pendingShipments}`, "已审核未出库销售订单"],
    ["应收账款", `¥ ${dashboard.receivableAmount}`, "未结清应收余额"],
  ];

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map(([label, value, hint]) => (
          <Card key={label}>
            <div className="flex items-center justify-between">
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                {label}
              </p>
              <Badge>实时</Badge>
            </div>
            <p className="mt-4 text-3xl font-semibold tracking-tight">
              {value}
            </p>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              {hint}
            </p>
          </Card>
        ))}
      </section>

      <Card className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Badge>农时提示</Badge>
            <span className="text-sm text-zinc-500 dark:text-zinc-400">
              春耕备货窗口
            </span>
          </div>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
            建议优先完善易损件、滤芯、皮带等高频 SKU 的基础资料和安全库存。
          </p>
        </div>
        <Select className="md:w-44" defaultValue="spring">
          <option value="spring">春耕</option>
          <option value="summer">夏管</option>
          <option value="autumn">秋收</option>
        </Select>
      </Card>

      <section className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold">经营趋势</h2>
            </div>
            <Tabs items={["7 天", "30 天", "90 天"]} />
          </div>
          <div className="mt-6 grid h-72 grid-cols-12 items-end gap-2 rounded-xl bg-zinc-50 p-4 dark:bg-zinc-900/50">
            {Array.from({ length: 12 }).map((_, index) => (
              <div
                className="rounded-t-md bg-zinc-200 dark:bg-zinc-800"
                key={index}
                style={{ height: `${28 + ((index * 17) % 58)}%` }}
              />
            ))}
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <h2 className="font-semibold">今日关注</h2>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-zinc-500 dark:text-zinc-400">
                  待发货订单
                </span>
                <span className="font-medium">{dashboard.pendingShipments} 单</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-500 dark:text-zinc-400">
                  应收余额
                </span>
                <span className="font-medium">¥ {dashboard.receivableAmount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-500 dark:text-zinc-400">
                  库存总值
                </span>
                <span className="font-medium">¥ {dashboard.inventoryValue}</span>
              </div>
            </div>
          </Card>
          <Card>
            <h2 className="font-semibold">快捷入口</h2>
            <div className="mt-4 grid gap-2 text-sm">
              <a className="rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800" href="/sales/orders">
                销售订单
              </a>
              <a className="rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800" href="/inventory">
                库存查询
              </a>
              <a className="rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800" href="/finance/receivables">
                应收账款
              </a>
            </div>
          </Card>
        </div>
      </section>

      <Card>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-semibold">最近销售单据</h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              进入销售订单详情可审核预占并执行出库。
            </p>
          </div>
          <Skeleton className="h-9 w-24" />
        </div>
        <Table>
          <thead className="bg-zinc-50 text-xs uppercase text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th className="px-4 py-3 font-medium">类型</th>
              <th className="px-4 py-3 font-medium">状态</th>
              <th className="px-4 py-3 font-medium">负责人</th>
            </tr>
          </thead>
          <tbody>
            {salesOrders.length === 0 ? (
              <tr>
                <td className="p-0" colSpan={3}>
                  <EmptyState
                    description="新建销售订单后，这里会展示最近需要处理的单据。"
                    title="暂无销售单据"
                  />
                </td>
              </tr>
            ) : (
              salesOrders.map((row) => (
                <tr className="border-t border-zinc-100 dark:border-zinc-900" key={String(row.id)}>
                  <td className="px-4 py-3">{String(row.code)}</td>
                  <td className="px-4 py-3">{String(row.status)}</td>
                  <td className="px-4 py-3">{String(row.customerName)}</td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
