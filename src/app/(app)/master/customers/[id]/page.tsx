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
import { getCustomerDetail } from "@/server/phase1/service";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getCurrentSession();
  const { id } = await params;
  const detail = session ? getCustomerDetail(session, id) : null;
  if (!detail) {
    notFound();
  }

  const customer = detail.customer;

  return (
    <div>
      <PageHeader
        description="客户详情聚合机器档案、应收余额与后续交易记录。"
        title={`${String(customer.code)} · ${String(customer.name)}`}
      />
      <DetailTabs />
      <Card className="grid gap-4 md:grid-cols-4">
        <Field label="联系人">{String(customer.contact_name)}</Field>
        <Field label="电话">{String(customer.phone)}</Field>
        <Field label="信用额度">¥ {String(customer.credit_limit)}</Field>
        <Field label="已用额度">¥ {String(customer.credit_used)}</Field>
        <Field label="账期">{String(customer.payment_term_days)} 天</Field>
        <Field label="等级">{String(customer.level)}</Field>
        <Field label="状态">
          <StatusBadge status={String(customer.status)} />
        </Field>
        <Field label="地址">{String(customer.address)}</Field>
      </Card>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <h2 className="mb-4 font-semibold">客户机器</h2>
          <Table>
            <tbody>
              {detail.machines.map((row) => (
                <tr className="border-t border-zinc-100 dark:border-zinc-900" key={String(row.id)}>
                  <td className="px-4 py-3">{String(row.code)}</td>
                  <td className="px-4 py-3">{String(row.manufacturer)} {String(row.model)}</td>
                  <td className="px-4 py-3">{String(row.factory_serial)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
        <Card>
          <h2 className="mb-4 font-semibold">应收账款</h2>
          <Table>
            <tbody>
              {detail.receivables.map((row) => (
                <tr className="border-t border-zinc-100 dark:border-zinc-900" key={String(row.id)}>
                  <td className="px-4 py-3">{String(row.code)}</td>
                  <td className="px-4 py-3">¥ {String(row.balance_amount)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={String(row.status)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>
    </div>
  );
}
