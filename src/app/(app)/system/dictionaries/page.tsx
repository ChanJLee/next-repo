import {
  Button,
  Card,
  FormField,
  FormGrid,
  PageHeader,
  StatusBadge,
  Table,
} from "@/components/phase1";
import { getCurrentSession } from "@/server/auth/current-session";
import { createDictionaryAction } from "@/server/phase3/actions";
import { listDictionaries } from "@/server/phase3/service";

export default async function DictionariesPage() {
  const session = await getCurrentSession();
  const rows = session ? listDictionaries(session) : [];

  return (
    <div>
      <PageHeader
        description="集中维护状态、农时、单据分类等可枚举值，支持按类型分组和排序。"
        title="数据字典"
      />
      <Card className="mb-6">
        <h2 className="mb-4 font-semibold">新增 / 覆盖字典项</h2>
        <form action={createDictionaryAction} className="space-y-4">
          <FormGrid>
            <FormField label="类型" name="type" />
            <FormField label="编码" name="code" />
            <FormField label="名称" name="label" />
            <FormField defaultValue="0" label="排序" name="sortOrder" type="number" />
          </FormGrid>
          <Button>保存字典</Button>
        </form>
      </Card>
      <Card>
        <Table>
          <thead className="bg-zinc-50 text-xs text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th className="px-4 py-3 font-medium">类型</th>
              <th className="px-4 py-3 font-medium">编码</th>
              <th className="px-4 py-3 font-medium">名称</th>
              <th className="px-4 py-3 font-medium">排序</th>
              <th className="px-4 py-3 font-medium">状态</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr className="border-t border-zinc-100 dark:border-zinc-900" key={String(row.id)}>
                <td className="px-4 py-3">{String(row.type)}</td>
                <td className="px-4 py-3">{String(row.code)}</td>
                <td className="px-4 py-3">{String(row.label)}</td>
                <td className="px-4 py-3">{String(row.sort_order)}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={Number(row.enabled) ? "ACTIVE" : "DISABLED"} />
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
