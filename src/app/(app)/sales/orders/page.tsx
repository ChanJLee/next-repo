import Link from "next/link";

import { Card, LinkButton, PageHeader, StatusBadge, Table } from "@/components/phase1";
import { getCurrentSession } from "@/server/auth/current-session";
import { listSalesOrders } from "@/server/phase1/service";

export default async function SalesOrdersPage() {
  const session = await getCurrentSession();
  const rows = session ? listSalesOrders(session) : [];

  return (
    <div>
      <PageHeader
        action={<LinkButton href="/sales/orders/new">新建销售订单</LinkButton>}
        description="审核时预占库存并校验信用额度，出库后生成应收。"
        title="销售订单"
      />
      <Card>
        <Table>
          <tbody>
            {rows.map((row) => (
              <tr className="border-t border-zinc-100 dark:border-zinc-900" key={String(row.id)}>
                <td className="px-4 py-3">
                  <Link className="font-medium hover:underline" href={`/sales/orders/${row.id}`}>
                    {String(row.code)}
                  </Link>
                </td>
                <td className="px-4 py-3">{String(row.customerName)}</td>
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
