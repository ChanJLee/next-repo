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
import { listParts } from "@/server/phase1/service";

export default async function PartsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await getCurrentSession();
  const { q = "" } = await searchParams;
  const rows = session ? listParts(session, q) : [];

  return (
    <div>
      <PageHeader
        action={
          <div className="flex gap-2">
            <LinkButton href="/api/exports/parts" variant="secondary">
              CSV 导出
            </LinkButton>
            <LinkButton href="/master/parts/new">新建配件</LinkButton>
          </div>
        }
        description="维护 SKU、替换件、机型适配、三包属性和农时备货参数。"
        title="配件主数据"
      />
      <SearchBar placeholder="搜索编码、名称、厂家件号" />
      <Card>
        <Table>
          <thead className="bg-zinc-50 text-xs text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th className="px-4 py-3 font-medium">编码</th>
              <th className="px-4 py-3 font-medium">名称</th>
              <th className="px-4 py-3 font-medium">厂家件号</th>
              <th className="px-4 py-3 font-medium">可用库存</th>
              <th className="px-4 py-3 font-medium">三包属性</th>
              <th className="px-4 py-3 font-medium">状态</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr className="border-t border-zinc-100 dark:border-zinc-900" key={String(row.id)}>
                <td className="px-4 py-3">
                  <Link className="font-medium hover:underline" href={`/master/parts/${row.id}`}>
                    {String(row.code)}
                  </Link>
                </td>
                <td className="px-4 py-3">{String(row.name)}</td>
                <td className="px-4 py-3 text-zinc-500">{String(row.oem_code)}</td>
                <td className="px-4 py-3">{String(row.qtyAvailable ?? "0")}</td>
                <td className="px-4 py-3">{String(row.warranty_type)}</td>
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
