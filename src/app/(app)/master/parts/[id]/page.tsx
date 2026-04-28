import { notFound } from "next/navigation";

import {
  Card,
  DetailTabs,
  Field,
  PageHeader,
  StatusBadge,
  Table,
} from "@/components/phase1";
import { getCurrentSession } from "@/server/auth/current-session";
import { getPartDetail } from "@/server/phase1/service";

export default async function PartDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getCurrentSession();
  const { id } = await params;
  const detail = session ? getPartDetail(session, id) : null;

  if (!detail) {
    notFound();
  }

  const part = detail.part;

  return (
    <div>
      <PageHeader
        description="统一详情结构：基本信息、关联单据、库存流水和操作日志。"
        title={`${String(part.code)} · ${String(part.name)}`}
      />
      <DetailTabs />
      <Card className="grid gap-4 md:grid-cols-4">
        <Field label="厂家件号">{String(part.oem_code)}</Field>
        <Field label="分类">{String(part.category)}</Field>
        <Field label="品牌">{String(part.brand)}</Field>
        <Field label="状态">
          <StatusBadge status={String(part.status)} />
        </Field>
        <Field label="采购参考价">¥ {String(part.ref_purchase_price)}</Field>
        <Field label="销售指导价">¥ {String(part.ref_sales_price)}</Field>
        <Field label="安全库存">{String(part.safety_stock)}</Field>
        <Field label="三包属性">{String(part.warranty_type)}</Field>
      </Card>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <h2 className="mb-4 font-semibold">适配机型</h2>
          <Table>
            <tbody>
              {detail.fitments.map((row) => (
                <tr className="border-t border-zinc-100 dark:border-zinc-900" key={String(row.id)}>
                  <td className="px-4 py-3">{String(row.manufacturer)}</td>
                  <td className="px-4 py-3">{String(row.model)}</td>
                  <td className="px-4 py-3">{String(row.year_from)}-{String(row.year_to)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
        <Card>
          <h2 className="mb-4 font-semibold">最近库存流水</h2>
          <Table>
            <tbody>
              {detail.transactions.map((row) => (
                <tr className="border-t border-zinc-100 dark:border-zinc-900" key={String(row.id)}>
                  <td className="px-4 py-3">{String(row.transaction_type)}</td>
                  <td className="px-4 py-3">{String(row.direction)}</td>
                  <td className="px-4 py-3">{String(row.qty)}</td>
                  <td className="px-4 py-3 text-zinc-500">{String(row.occurred_at)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>
    </div>
  );
}
