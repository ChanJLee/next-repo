import {
  Button,
  Card,
  FormField,
  FormGrid,
  PageHeader,
  SelectField,
  Table,
} from "@/components/phase1";
import { SafeForm } from "@/components/safe-form";
import { Badge } from "@/components/ui";
import { getCurrentSession } from "@/server/auth/current-session";
import { createParameterAction } from "@/server/phase3/actions";
import { listParameters } from "@/server/phase3/service";

export default async function ParametersPage() {
  const session = await getCurrentSession();
  const rows = session ? listParameters(session) : [];

  return (
    <div>
      <PageHeader
        description="维护信用控制、三包周期、保养提前比例等租户级参数，业务服务读取后统一生效。"
        title="参数配置"
      />
      <Card className="mb-6">
        <h2 className="mb-4 font-semibold">新增 / 覆盖参数</h2>
        <SafeForm action={createParameterAction} className="space-y-4">
          <FormGrid>
            <FormField label="参数键" name="paramKey" />
            <FormField label="参数值" name="paramValue" />
            <SelectField label="值类型" name="valueType">
              <option value="TEXT">文本</option>
              <option value="NUMBER">数字</option>
              <option value="BOOLEAN">布尔</option>
              <option value="JSON">JSON</option>
            </SelectField>
            <FormField label="说明" name="description" />
          </FormGrid>
          <Button>保存参数</Button>
        </SafeForm>
      </Card>
      <Card>
        <Table>
          <thead className="bg-zinc-50 text-xs text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th className="px-4 py-3 font-medium">参数键</th>
              <th className="px-4 py-3 font-medium">值</th>
              <th className="px-4 py-3 font-medium">类型</th>
              <th className="px-4 py-3 font-medium">说明</th>
              <th className="px-4 py-3 font-medium">更新时间</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr className="border-t border-zinc-100 dark:border-zinc-900" key={String(row.id)}>
                <td className="px-4 py-3">{String(row.param_key)}</td>
                <td className="px-4 py-3">{String(row.param_value)}</td>
                <td className="px-4 py-3"><Badge>{String(row.value_type)}</Badge></td>
                <td className="px-4 py-3">{String(row.description)}</td>
                <td className="px-4 py-3">{String(row.updated_at)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
