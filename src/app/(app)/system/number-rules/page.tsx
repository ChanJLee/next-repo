import {
  Button,
  Card,
  FormField,
  FormGrid,
  PageHeader,
  SelectField,
  Table,
} from "@/components/phase1";
import { Badge } from "@/components/ui";
import { getCurrentSession } from "@/server/auth/current-session";
import { createNumberRuleAction } from "@/server/phase3/actions";
import { listNumberRules, previewNextDocumentCode } from "@/server/phase3/service";

export default async function NumberRulesPage() {
  const session = await getCurrentSession();
  const rows = session ? listNumberRules(session) : [];

  return (
    <div>
      <PageHeader
        description="维护单据类型、前缀、日期模式、流水长度和重置周期，统一约束业务编号规则。"
        title="单据编号规则"
      />
      <Card className="mb-6">
        <h2 className="mb-4 font-semibold">新增 / 覆盖规则</h2>
        <form action={createNumberRuleAction} className="space-y-4">
          <FormGrid>
            <SelectField label="单据类型" name="documentType">
              <option value="SALES_ORDER">销售订单</option>
              <option value="PURCHASE_ORDER">采购订单</option>
              <option value="SERVICE_ORDER">服务工单</option>
              <option value="WARRANTY_CLAIM">三包索赔</option>
              <option value="SUBSIDY_LEDGER">补贴台账</option>
            </SelectField>
            <FormField label="前缀" name="prefix" />
            <FormField defaultValue="yyyyMMdd" label="日期模式" name="datePattern" />
            <FormField defaultValue="4" label="流水长度" name="sequenceLength" type="number" />
            <SelectField label="重置周期" name="resetCycle">
              <option value="DAY">每日</option>
              <option value="MONTH">每月</option>
              <option value="YEAR">每年</option>
              <option value="NEVER">不重置</option>
            </SelectField>
            <SelectField label="启用状态" name="enabled">
              <option value="1">启用</option>
              <option value="0">停用</option>
            </SelectField>
          </FormGrid>
          <Button>保存规则</Button>
        </form>
      </Card>
      <Card>
        <Table>
          <thead className="bg-zinc-50 text-xs text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th className="px-4 py-3 font-medium">单据类型</th>
              <th className="px-4 py-3 font-medium">规则</th>
              <th className="px-4 py-3 font-medium">预览</th>
              <th className="px-4 py-3 font-medium">状态</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr className="border-t border-zinc-100 dark:border-zinc-900" key={String(row.id)}>
                <td className="px-4 py-3">{String(row.document_type)}</td>
                <td className="px-4 py-3">
                  {String(row.prefix)} + {String(row.date_pattern)} +{" "}
                  {String(row.sequence_length).padStart(Number(row.sequence_length), "0")}
                  <p className="mt-1 text-xs text-zinc-500">重置：{String(row.reset_cycle)}</p>
                </td>
                <td className="px-4 py-3">
                  {previewNextDocumentCode({ prefix: String(row.prefix) })}
                </td>
                <td className="px-4 py-3"><Badge>{Number(row.enabled) ? "启用" : "停用"}</Badge></td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
