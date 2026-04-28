import { Card, PageHeader, StatusBadge, Table } from "@/components/phase1";
import { getCurrentSession } from "@/server/auth/current-session";
import { listMachineModels } from "@/server/phase1/service";

export default async function MachinesPage() {
  const session = await getCurrentSession();
  const rows = session ? listMachineModels(session) : [];

  return (
    <div>
      <PageHeader
        description="机型库用于销售选型、适配 SKU 过滤和客户机器档案。"
        title="机型库"
      />
      <Card>
        <Table>
          <thead className="bg-zinc-50 text-xs text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th className="px-4 py-3 font-medium">编码</th>
              <th className="px-4 py-3 font-medium">厂商</th>
              <th className="px-4 py-3 font-medium">系列/型号</th>
              <th className="px-4 py-3 font-medium">年份</th>
              <th className="px-4 py-3 font-medium">状态</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr className="border-t border-zinc-100 dark:border-zinc-900" key={String(row.id)}>
                <td className="px-4 py-3">{String(row.code)}</td>
                <td className="px-4 py-3">{String(row.manufacturer)}</td>
                <td className="px-4 py-3">{String(row.series)} {String(row.model)}</td>
                <td className="px-4 py-3">{String(row.year_from)}-{String(row.year_to)}</td>
                <td className="px-4 py-3"><StatusBadge status={String(row.status)} /></td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
