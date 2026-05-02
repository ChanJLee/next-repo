import { notFound } from "next/navigation";

import { Button, Card, DetailTabs, PageHeader, StatusBadge, Table } from "@/components/phase1";
import { SafeForm } from "@/components/safe-form";
import { getCurrentSession } from "@/server/auth/current-session";
import {
  approvePurchaseOrderAction,
  receivePurchaseOrderAction,
} from "@/server/phase1/actions";
import { getPurchaseOrderDetail } from "@/server/phase1/service";

export default async function PurchaseOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getCurrentSession();
  const { id } = await params;
  const detail = session ? getPurchaseOrderDetail(session, id) : null;
  if (!detail) {
    notFound();
  }

  const order = detail.order;

  return (
    <div>
      <PageHeader
        action={
          <div className="flex gap-2">
            <SafeForm action={approvePurchaseOrderAction}>
              <input name="id" type="hidden" value={id} />
              <Button disabled={String(order.status) !== "DRAFT"} variant="secondary">审核</Button>
            </SafeForm>
            <SafeForm action={receivePurchaseOrderAction}>
              <input name="id" type="hidden" value={id} />
              <Button disabled={String(order.status) !== "APPROVED"}>收货入库</Button>
            </SafeForm>
          </div>
        }
        description="审核后可收货入库，入库会更新库存余额和流水。"
        title={String(order.code)}
      />
      <DetailTabs />
      <Card className="mb-6 flex flex-wrap gap-6">
        <div>供应商：{String(order.supplierName)}</div>
        <div>仓库：{String(order.warehouseName)}</div>
        <div>金额：¥ {String(order.total_amount)}</div>
        <StatusBadge status={String(order.status)} />
      </Card>
      <Card>
        <Table>
          <thead className="bg-zinc-50 text-xs text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th className="px-4 py-3 font-medium">配件</th>
              <th className="px-4 py-3 font-medium">数量</th>
              <th className="px-4 py-3 font-medium">已收</th>
              <th className="px-4 py-3 font-medium">单价</th>
              <th className="px-4 py-3 font-medium">金额</th>
            </tr>
          </thead>
          <tbody>
            {detail.lines.map((row) => (
              <tr className="border-t border-zinc-100 dark:border-zinc-900" key={String(row.id)}>
                <td className="px-4 py-3">{String(row.partCode)} · {String(row.partName)}</td>
                <td className="px-4 py-3">{String(row.qty)}</td>
                <td className="px-4 py-3">{String(row.received_qty)}</td>
                <td className="px-4 py-3">¥ {String(row.unit_price)}</td>
                <td className="px-4 py-3">¥ {String(row.amount)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
