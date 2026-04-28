import Link from "next/link";

import { Card, LinkButton, PageHeader, StatusBadge, Table } from "@/components/phase1";
import { getCurrentSession } from "@/server/auth/current-session";
import { listPurchaseOrders } from "@/server/phase1/service";

export default async function PurchaseOrdersPage() {
  const session = await getCurrentSession();
  const rows = session ? listPurchaseOrders(session) : [];

  return (
    <div>
      <PageHeader
        action={<LinkButton href="/purchase/orders/new">新建采购订单</LinkButton>}
        description="状态机：草稿 → 已审核 → 已入库，收货时写库存流水和余额。"
        title="采购订单"
      />
      <Card>
        <Table>
          <tbody>
            {rows.map((row) => (
              <tr className="border-t border-zinc-100 dark:border-zinc-900" key={String(row.id)}>
                <td className="px-4 py-3">
                  <Link className="font-medium hover:underline" href={`/purchase/orders/${row.id}`}>
                    {String(row.code)}
                  </Link>
                </td>
                <td className="px-4 py-3">{String(row.supplierName)}</td>
                <td className="px-4 py-3">{String(row.warehouseName)}</td>
                <td className="px-4 py-3">¥ {String(row.total_amount)}</td>
                <td className="px-4 py-3"><StatusBadge status={String(row.status)} /></td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
