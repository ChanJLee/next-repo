import { Card, PageHeader, StatusBadge, Table } from "@/components/phase1";
import { getCurrentSession } from "@/server/auth/current-session";
import { listCustomerMachines } from "@/server/phase1/service";

export default async function CustomerMachinesPage() {
  const session = await getCurrentSession();
  const rows = session ? listCustomerMachines(session) : [];

  return (
    <div>
      <PageHeader
        description="一台农机一档，自动计算整机和关键件三包到期日。"
        title="客户机器档案"
      />
      <Card>
        <Table>
          <thead className="bg-zinc-50 text-xs text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th className="px-4 py-3 font-medium">编号</th>
              <th className="px-4 py-3 font-medium">客户</th>
              <th className="px-4 py-3 font-medium">机型</th>
              <th className="px-4 py-3 font-medium">出厂号</th>
              <th className="px-4 py-3 font-medium">三包到期</th>
              <th className="px-4 py-3 font-medium">状态</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr className="border-t border-zinc-100 dark:border-zinc-900" key={String(row.id)}>
                <td className="px-4 py-3">{String(row.code)}</td>
                <td className="px-4 py-3">{String(row.customerName)}</td>
                <td className="px-4 py-3">{String(row.manufacturer)} {String(row.model)}</td>
                <td className="px-4 py-3">{String(row.factory_serial)}</td>
                <td className="px-4 py-3">{String(row.whole_warranty_until)}</td>
                <td className="px-4 py-3"><StatusBadge status={String(row.status)} /></td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
