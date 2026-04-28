import {
  Button,
  Card,
  PageHeader,
  Select,
  StatusBadge,
  Table,
} from "@/components/phase1";
import { getCurrentSession } from "@/server/auth/current-session";
import {
  convertStockingSuggestionAction,
  regenerateStockingSuggestionsAction,
} from "@/server/phase2/actions";
import { listStockingSuggestions } from "@/server/phase2/service";

export default async function StockingSuggestionsPage() {
  const session = await getCurrentSession();
  const rows = session ? listStockingSuggestions(session) : [];

  return (
    <div>
      <PageHeader
        description="后端按安全库存、当前库存和配件农时系数计算建议量，可一键转采购订单。"
        title="农忙备货建议"
      />
      <Card className="mb-6">
        <form action={regenerateStockingSuggestionsAction} className="flex items-center gap-3">
          <Select className="max-w-48" name="season">
            <option value="SPRING">春耕</option>
            <option value="SUMMER">夏管</option>
            <option value="AUTUMN">秋收</option>
          </Select>
          <Button>重新计算建议</Button>
        </form>
      </Card>
      <Card>
        <Table>
          <thead className="bg-zinc-50 text-xs text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th className="px-4 py-3 font-medium">配件</th>
              <th className="px-4 py-3 font-medium">仓库</th>
              <th className="px-4 py-3 font-medium">当前 / 安全</th>
              <th className="px-4 py-3 font-medium">农时系数</th>
              <th className="px-4 py-3 font-medium">建议采购</th>
              <th className="px-4 py-3 font-medium">状态</th>
              <th className="px-4 py-3 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr className="border-t border-zinc-100 dark:border-zinc-900" key={String(row.id)}>
                <td className="px-4 py-3">{String(row.partCode)} · {String(row.partName)}</td>
                <td className="px-4 py-3">{String(row.warehouseName)}</td>
                <td className="px-4 py-3">{String(row.current_qty)} / {String(row.safety_stock)}</td>
                <td className="px-4 py-3">{String(row.season_factor)}</td>
                <td className="px-4 py-3">{String(row.suggested_qty)}</td>
                <td className="px-4 py-3"><StatusBadge status={String(row.status)} /></td>
                <td className="px-4 py-3">
                  {String(row.purchaseOrderCode || "") ? (
                    <span className="text-sm text-zinc-500">{String(row.purchaseOrderCode)}</span>
                  ) : (
                    <form action={convertStockingSuggestionAction}>
                      <input name="id" type="hidden" value={String(row.id)} />
                      <Button
                        disabled={String(row.status) !== "OPEN" || Number(row.suggested_qty) <= 0}
                        variant="secondary"
                      >
                        转采购单
                      </Button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
