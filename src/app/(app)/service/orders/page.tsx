import Link from "next/link";

import { Card, LinkButton, PageHeader, StatusBadge, Table } from "@/components/phase1";
import { getCurrentSession } from "@/server/auth/current-session";
import { listServiceOrders } from "@/server/phase2/service";

export default async function ServiceOrdersPage() {
  const session = await getCurrentSession();
  const rows = session ? listServiceOrders(session) : [];

  return (
    <div>
      <PageHeader
        action={<LinkButton href="/service/orders/new">报修录入</LinkButton>}
        description="覆盖电话、小程序、销售上报和保养转入，按状态机推进上门服务。"
        title="服务工单"
      />
      <Card>
        <Table>
          <thead className="bg-zinc-50 text-xs text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th className="px-4 py-3 font-medium">工单</th>
              <th className="px-4 py-3 font-medium">客户 / 机器</th>
              <th className="px-4 py-3 font-medium">紧急程度</th>
              <th className="px-4 py-3 font-medium">工程师</th>
              <th className="px-4 py-3 font-medium">状态</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr className="border-t border-zinc-100 dark:border-zinc-900" key={String(row.id)}>
                <td className="px-4 py-3">
                  <Link className="font-medium hover:underline" href={`/service/orders/${row.id}`}>
                    {String(row.code)}
                  </Link>
                  <p className="mt-1 text-xs text-zinc-500">{String(row.fault_description)}</p>
                </td>
                <td className="px-4 py-3">
                  {String(row.customerName)}
                  <p className="mt-1 text-xs text-zinc-500">{String(row.factorySerial ?? "-")}</p>
                </td>
                <td className="px-4 py-3">{String(row.urgency)}</td>
                <td className="px-4 py-3">{String(row.assigned_engineer_name || "未派单")}</td>
                <td className="px-4 py-3"><StatusBadge status={String(row.status)} /></td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
