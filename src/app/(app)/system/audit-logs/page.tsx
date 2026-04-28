import { Card, PageHeader, SearchBar, Table } from "@/components/phase1";
import { formatUtc8DateTime } from "@/lib/date";
import { getCurrentSession } from "@/server/auth/current-session";
import { listAuditLogs } from "@/server/phase3/service";

export default async function AuditLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const session = await getCurrentSession();
  const rows = session ? listAuditLogs(session, q) : [];

  return (
    <div>
      <PageHeader
        description="按操作对象、动作和单据 ID 检索最近 100 条审计日志，便于追踪写操作来源。"
        title="操作日志检索"
      />
      <Card>
        <SearchBar placeholder="搜索实体、动作或单据 ID" />
        <Table>
          <thead className="bg-zinc-50 text-xs text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th className="px-4 py-3 font-medium">时间</th>
              <th className="px-4 py-3 font-medium">用户</th>
              <th className="px-4 py-3 font-medium">动作</th>
              <th className="px-4 py-3 font-medium">对象</th>
              <th className="px-4 py-3 font-medium">详情</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr className="border-t border-zinc-100 dark:border-zinc-900" key={String(row.id)}>
                <td className="px-4 py-3">{formatUtc8DateTime(row.created_at)}</td>
                <td className="px-4 py-3">{String(row.userName ?? "-")}</td>
                <td className="px-4 py-3">{String(row.action)}</td>
                <td className="px-4 py-3">
                  {String(row.entity)}
                  <p className="mt-1 text-xs text-zinc-500">{String(row.entity_id ?? "")}</p>
                </td>
                <td className="px-4 py-3 text-xs text-zinc-500">{String(row.detail)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
