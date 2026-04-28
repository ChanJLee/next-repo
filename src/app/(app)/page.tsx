import {
  Badge,
  Card,
  Dialog,
  Drawer,
  EmptyState,
  Select,
  Skeleton,
  Table,
  Tabs,
  Toast,
} from "@/components/ui";

const metrics = [
  ["今日销售额", "¥ 0", "等待销售单据接入"],
  ["库存预警", "0", "Phase 1 接入库存余额"],
  ["待收货订单", "0", "Phase 1 接入采购流程"],
  ["应收账款", "¥ 0", "Phase 1 接入财务模块"],
];

export default function DashboardPage() {
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
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                图表组件占位，后续接入销售、库存和应收数据。
              </p>
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
          <Drawer title="⌘K 命令面板骨架">
            支持后续接入全局搜索、快速新建单据和跳转常用模块。
          </Drawer>
          <Dialog title="基础组件验收">
            Button / Input / Select / Table / Card / Badge / Dialog / Drawer /
            Toast / Tabs / Breadcrumb / EmptyState / Skeleton 已建立。
          </Dialog>
          <Toast>数据库迁移与演示账号会在 `pnpm dev` 启动前准备完成。</Toast>
        </div>
      </section>

      <Card>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-semibold">待办单据</h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              空状态用于 Phase 1 模块逐步挂载。
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
            <tr>
              <td className="p-0" colSpan={3}>
                <EmptyState
                  description="完成采购、库存、销售模块后，这里会展示需要处理的业务单据。"
                  title="暂无待办"
                />
              </td>
            </tr>
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
