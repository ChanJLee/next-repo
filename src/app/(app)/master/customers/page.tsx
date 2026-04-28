import Link from "next/link";

import {
  Card,
  LinkButton,
  PageHeader,
  SearchBar,
  StatusBadge,
  Table,
} from "@/components/phase1";
import { getCurrentSession } from "@/server/auth/current-session";
import { listCustomers } from "@/server/phase1/service";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await getCurrentSession();
  const { q = "" } = await searchParams;
  const rows = session ? listCustomers(session, q) : [];

  return (
    <div>
      <PageHeader
        action={
          <div className="flex gap-2">
            <LinkButton href="/api/exports/customers" variant="secondary">
              CSV 导出
            </LinkButton>
            <LinkButton href="/master/customers/new">新建客户</LinkButton>
          </div>
        }
        description="维护客户信用额度、账期、联系人与关联机器档案。"
        title="客户档案"
      />
      <SearchBar placeholder="搜索客户编码、名称、电话" />
      <Card>
        <Table>
          <thead className="bg-zinc-50 text-xs text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th className="px-4 py-3 font-medium">编码</th>
              <th className="px-4 py-3 font-medium">名称</th>
              <th className="px-4 py-3 font-medium">联系人</th>
              <th className="px-4 py-3 font-medium">信用额度</th>
              <th className="px-4 py-3 font-medium">已用额度</th>
              <th className="px-4 py-3 font-medium">状态</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr className="border-t border-zinc-100 dark:border-zinc-900" key={String(row.id)}>
                <td className="px-4 py-3">
                  <Link className="font-medium hover:underline" href={`/master/customers/${row.id}`}>
                    {String(row.code)}
                  </Link>
                </td>
                <td className="px-4 py-3">{String(row.name)}</td>
                <td className="px-4 py-3">{String(row.contact_name)}</td>
                <td className="px-4 py-3">¥ {String(row.credit_limit)}</td>
                <td className="px-4 py-3">¥ {String(row.credit_used)}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={String(row.status)} />
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
