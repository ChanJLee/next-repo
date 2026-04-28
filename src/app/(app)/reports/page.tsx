import { ReportChart } from "@/components/charts/report-chart";
import { Badge, Card, EmptyState, Table } from "@/components/ui";
import { PageHeader } from "@/components/phase1";
import { getCurrentSession } from "@/server/auth/current-session";
import { getFixedReports, listCustomReports } from "@/server/phase3/service";

export default async function ReportsPage() {
  const session = await getCurrentSession();
  const reports = session ? getFixedReports(session) : [];
  const customReports = session ? listCustomReports(session) : [];

  return (
    <div>
      <PageHeader
        description="覆盖销售、库存、采购、售后、三包和财务六大固定报表，图表统一使用 ECharts。"
        title="报表中心"
      />

      <section className="grid gap-6 xl:grid-cols-2">
        {reports.map((report) => (
          <Card key={report.key}>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="font-semibold">{report.title}</h2>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  {report.valueLabel}合计：{report.total}
                </p>
              </div>
              <Badge>固定报表</Badge>
            </div>
            {report.rows.length > 0 ? (
              <ReportChart
                rows={report.rows.map((row) => ({
                  name: String(row.name ?? "未分类"),
                  value: Number(row.value ?? 0),
                }))}
                title={report.title}
              />
            ) : (
              <EmptyState description="演示数据不足时，这里会等待业务单据沉淀。" title="暂无报表数据" />
            )}
          </Card>
        ))}
      </section>

      <Card className="mt-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-semibold">自定义报表</h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              V1 基础版先保存行列指标配置，后续可升级为拖拽设计器。
            </p>
          </div>
          <Badge>基础版</Badge>
        </div>
        <Table>
          <thead className="bg-zinc-50 text-xs text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th className="px-4 py-3 font-medium">编码</th>
              <th className="px-4 py-3 font-medium">名称</th>
              <th className="px-4 py-3 font-medium">领域</th>
              <th className="px-4 py-3 font-medium">布局配置</th>
            </tr>
          </thead>
          <tbody>
            {customReports.map((row) => (
              <tr className="border-t border-zinc-100 dark:border-zinc-900" key={String(row.id)}>
                <td className="px-4 py-3">{String(row.code)}</td>
                <td className="px-4 py-3">{String(row.name)}</td>
                <td className="px-4 py-3">{String(row.report_domain)}</td>
                <td className="px-4 py-3 text-xs text-zinc-500">{String(row.layout_json)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
