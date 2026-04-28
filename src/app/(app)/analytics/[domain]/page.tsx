import { notFound } from "next/navigation";

import { ReportChart } from "@/components/charts/report-chart";
import { Card, EmptyState, Table } from "@/components/ui";
import { PageHeader } from "@/components/phase1";
import { getCurrentSession } from "@/server/auth/current-session";
import { getFixedReports, listCustomReports } from "@/server/phase3/service";

const domainTitles: Record<string, string> = {
  sales: "销售报表",
  inventory: "库存报表",
  purchase: "采购报表",
  service: "售后报表",
  warranty: "三包报表",
  finance: "财务报表",
  custom: "自定义报表",
};

export default async function AnalyticsDomainPage({
  params,
}: {
  params: Promise<{ domain: string }>;
}) {
  const { domain } = await params;
  const title = domainTitles[domain];
  if (!title) {
    notFound();
  }

  const session = await getCurrentSession();

  if (domain === "custom") {
    const customReports = session ? listCustomReports(session) : [];

    return (
      <div>
        <PageHeader
          description="V1 基础版保存行列指标配置，作为后续拖拽设计器的数据基础。"
          title={title}
        />
        <Card>
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

  const report = session
    ? getFixedReports(session).find((item) => item.key === domain)
    : undefined;
  if (!report) {
    notFound();
  }

  return (
    <div>
      <PageHeader
        description={`${report.valueLabel}合计：${report.total}。数据来自当前租户与组织范围内的业务单据。`}
        title={title}
      />
      <Card>
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
    </div>
  );
}
