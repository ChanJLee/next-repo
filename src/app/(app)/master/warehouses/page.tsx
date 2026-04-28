import { Card, PageHeader, StatusBadge, Table } from "@/components/phase1";
import { getCurrentSession } from "@/server/auth/current-session";
import { listWarehouses } from "@/server/phase1/service";

export default async function WarehousesPage() {
  const session = await getCurrentSession();
  const rows = session ? listWarehouses(session) : [];

  return (
    <div>
      <PageHeader description="仓库和库位作为库存余额、采购入库、销售出库的落点。" title="仓库与库位" />
      <Card>
        <Table>
          <tbody>
            {rows.map((row) => (
              <tr className="border-t border-zinc-100 dark:border-zinc-900" key={String(row.id)}>
                <td className="px-4 py-3 font-medium">{String(row.code)}</td>
                <td className="px-4 py-3">{String(row.name)}</td>
                <td className="px-4 py-3">{String(row.type)}</td>
                <td className="px-4 py-3">库位 {String(row.locationCount)}</td>
                <td className="px-4 py-3"><StatusBadge status={String(row.status)} /></td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
