import { Card, LinkButton, PageHeader, StatusBadge, Table } from "@/components/phase1";
import { getCurrentSession } from "@/server/auth/current-session";
import { listReceivables } from "@/server/phase1/service";

export default async function ReceivablesPage() {
  const session = await getCurrentSession();
  const rows = session ? listReceivables(session) : [];

  return (
    <div>
      <PageHeader
        action={<LinkButton href="/finance/payments/new">登记收款</LinkButton>}
        description="销售出库自动生成应收，列表按账龄分桶展示。"
        title="应收账款"
      />
      <Card>
        <Table>
          <thead className="bg-zinc-50 text-xs text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th className="px-4 py-3 font-medium">单号</th>
              <th className="px-4 py-3 font-medium">客户</th>
              <th className="px-4 py-3 font-medium">金额</th>
              <th className="px-4 py-3 font-medium">余额</th>
              <th className="px-4 py-3 font-medium">到期日</th>
              <th className="px-4 py-3 font-medium">账龄</th>
              <th className="px-4 py-3 font-medium">状态</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr className="border-t border-zinc-100 dark:border-zinc-900" key={String(row.id)}>
                <td className="px-4 py-3 font-medium">{String(row.code)}</td>
                <td className="px-4 py-3">{String(row.customerName)}</td>
                <td className="px-4 py-3">¥ {String(row.amount)}</td>
                <td className="px-4 py-3">¥ {String(row.balance_amount)}</td>
                <td className="px-4 py-3">{String(row.due_date)}</td>
                <td className="px-4 py-3">{String(row.ageBucket)}</td>
                <td className="px-4 py-3"><StatusBadge status={String(row.status)} /></td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
