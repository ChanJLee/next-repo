import { Card, PageHeader, StatusBadge, Table } from "@/components/phase1";
import { getCurrentSession } from "@/server/auth/current-session";
import { listSuppliers } from "@/server/phase1/service";

export default async function SuppliersPage() {
  const session = await getCurrentSession();
  const rows = session ? listSuppliers(session) : [];

  return (
    <div>
      <PageHeader description="采购订单使用供应商档案控制账期与履约评分。" title="供应商档案" />
      <Card>
        <Table>
          <tbody>
            {rows.map((row) => (
              <tr className="border-t border-zinc-100 dark:border-zinc-900" key={String(row.id)}>
                <td className="px-4 py-3 font-medium">{String(row.code)}</td>
                <td className="px-4 py-3">{String(row.name)}</td>
                <td className="px-4 py-3">{String(row.contact_name)} · {String(row.phone)}</td>
                <td className="px-4 py-3">账期 {String(row.payment_term_days)} 天</td>
                <td className="px-4 py-3"><StatusBadge status={String(row.status)} /></td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
