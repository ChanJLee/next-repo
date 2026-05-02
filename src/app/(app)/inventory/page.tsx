import {
  Button,
  Card,
  LinkButton,
  PageHeader,
  Select,
  Table,
} from "@/components/phase1";
import { SafeForm } from "@/components/safe-form";
import { getCurrentSession } from "@/server/auth/current-session";
import { createStockCountAction } from "@/server/phase1/actions";
import { listInventory, listWarehouses } from "@/server/phase1/service";

export default async function InventoryPage() {
  const session = await getCurrentSession();
  const rows = session ? listInventory(session) : [];
  const warehouses = session ? listWarehouses(session) : [];

  return (
    <div>
      <PageHeader
        action={
          <div className="flex gap-2">
            <LinkButton href="/api/exports/inventory" variant="secondary">
              CSV 导出
            </LinkButton>
            <LinkButton href="/inventory/transactions" variant="secondary">
              查看流水
            </LinkButton>
          </div>
        }
        description="展示库存余额、可用量、安全库存和库龄基础信息。"
        title="库存查询"
      />
      <Card className="mb-4">
        <SafeForm action={createStockCountAction} className="flex items-center gap-3">
          <Select className="max-w-64" name="warehouseId">
            {warehouses.map((row) => (
              <option key={String(row.id)} value={String(row.id)}>
                {String(row.name)}
              </option>
            ))}
          </Select>
          <Button variant="secondary">创建盘点单</Button>
        </SafeForm>
      </Card>
      <Card>
        <Table>
          <thead className="bg-zinc-50 text-xs text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th className="px-4 py-3 font-medium">配件</th>
              <th className="px-4 py-3 font-medium">仓库</th>
              <th className="px-4 py-3 font-medium">现存</th>
              <th className="px-4 py-3 font-medium">预占</th>
              <th className="px-4 py-3 font-medium">可用</th>
              <th className="px-4 py-3 font-medium">安全库存</th>
              <th className="px-4 py-3 font-medium">平均成本</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr className="border-t border-zinc-100 dark:border-zinc-900" key={String(row.id)}>
                <td className="px-4 py-3">{String(row.partCode)} · {String(row.partName)}</td>
                <td className="px-4 py-3">{String(row.warehouseName)}</td>
                <td className="px-4 py-3">{String(row.qty_on_hand)}</td>
                <td className="px-4 py-3">{String(row.qty_allocated)}</td>
                <td className="px-4 py-3">{String(row.qty_available)}</td>
                <td className="px-4 py-3">{String(row.safetyStock)}</td>
                <td className="px-4 py-3">¥ {String(row.avg_cost)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
