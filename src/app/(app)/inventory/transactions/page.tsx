import { Card, PageHeader, Table } from "@/components/phase1";
import { getCurrentSession } from "@/server/auth/current-session";
import { listStockTransactions } from "@/server/phase1/service";

export default async function StockTransactionsPage() {
  const session = await getCurrentSession();
  const rows = session ? listStockTransactions(session) : [];

  return (
    <div>
      <PageHeader description="只读流水，按时间倒序展示采购入库、销售出库和期初库存。" title="出入库流水" />
      <Card>
        <Table>
          <thead className="bg-zinc-50 text-xs text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th className="px-4 py-3 font-medium">时间</th>
              <th className="px-4 py-3 font-medium">类型</th>
              <th className="px-4 py-3 font-medium">方向</th>
              <th className="px-4 py-3 font-medium">配件</th>
              <th className="px-4 py-3 font-medium">仓库</th>
              <th className="px-4 py-3 font-medium">数量</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr className="border-t border-zinc-100 dark:border-zinc-900" key={String(row.id)}>
                <td className="px-4 py-3 text-zinc-500">{String(row.occurred_at)}</td>
                <td className="px-4 py-3">{String(row.transaction_type)}</td>
                <td className="px-4 py-3">{String(row.direction)}</td>
                <td className="px-4 py-3">{String(row.partCode)} · {String(row.partName)}</td>
                <td className="px-4 py-3">{String(row.warehouseName)}</td>
                <td className="px-4 py-3">{String(row.qty)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
