import { notFound } from "next/navigation";

import { Button, Card, DetailTabs, PageHeader, StatusBadge, Table } from "@/components/phase1";
import { getCurrentSession } from "@/server/auth/current-session";
import { approveSalesOrderAction, shipSalesOrderAction } from "@/server/phase1/actions";
import { getSalesOrderDetail } from "@/server/phase1/service";

export default async function SalesOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getCurrentSession();
  const { id } = await params;
  const detail = session ? getSalesOrderDetail(session, id) : null;
  if (!detail) {
    notFound();
  }

  const order = detail.order;

  return (
    <div>
      <PageHeader
        action={
          <div className="flex gap-2">
            <form action={approveSalesOrderAction}>
              <input name="id" type="hidden" value={id} />
              <Button disabled={String(order.status) !== "DRAFT"} variant="secondary">审核并预占</Button>
            </form>
            <form action={shipSalesOrderAction}>
              <input name="id" type="hidden" value={id} />
              <Button disabled={String(order.status) !== "APPROVED"}>销售出库</Button>
            </form>
          </div>
        }
        description="出库会扣减现存、释放预占，并生成应收账款。"
        title={String(order.code)}
      />
      <DetailTabs />
      <Card className="mb-6 flex flex-wrap gap-6">
        <div>客户：{String(order.customerName)}</div>
        <div>金额：¥ {String(order.total_amount)}</div>
        <StatusBadge status={String(order.status)} />
      </Card>
      <Card>
        <Table>
          <thead className="bg-zinc-50 text-xs text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th className="px-4 py-3 font-medium">配件</th>
              <th className="px-4 py-3 font-medium">仓库</th>
              <th className="px-4 py-3 font-medium">数量</th>
              <th className="px-4 py-3 font-medium">预占</th>
              <th className="px-4 py-3 font-medium">已出</th>
              <th className="px-4 py-3 font-medium">金额</th>
            </tr>
          </thead>
          <tbody>
            {detail.lines.map((row) => (
              <tr className="border-t border-zinc-100 dark:border-zinc-900" key={String(row.id)}>
                <td className="px-4 py-3">{String(row.partCode)} · {String(row.partName)}</td>
                <td className="px-4 py-3">{String(row.warehouseName)}</td>
                <td className="px-4 py-3">{String(row.qty)}</td>
                <td className="px-4 py-3">{String(row.allocated_qty)}</td>
                <td className="px-4 py-3">{String(row.shipped_qty)}</td>
                <td className="px-4 py-3">¥ {String(row.amount)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
