import {
  Button,
  Card,
  FormField,
  FormGrid,
  PageHeader,
  SelectField,
  StatusBadge,
  Table,
} from "@/components/phase1";
import { getCurrentSession } from "@/server/auth/current-session";
import { listMachineModels } from "@/server/phase1/service";
import { createMaintenanceTemplateAction } from "@/server/phase2/actions";
import { listMaintenanceTemplates } from "@/server/phase2/service";

export default async function MaintenanceTemplatesPage() {
  const session = await getCurrentSession();
  const rows = session ? listMaintenanceTemplates(session) : [];
  const machines = session ? listMachineModels(session) : [];

  return (
    <div>
      <PageHeader
        description="按机型配置 500h、1000h 等保养阈值和配件包，供预订单自动生成使用。"
        title="保养模板"
      />
      <section className="mb-6 grid gap-6 xl:grid-cols-[420px_1fr]">
        <Card>
          <h2 className="mb-4 font-semibold">新建模板</h2>
          <form action={createMaintenanceTemplateAction} className="space-y-4">
            <SelectField label="机型" name="machineModelId">
              {machines.map((row) => (
                <option key={String(row.id)} value={String(row.id)}>
                  {String(row.manufacturer)} · {String(row.model)}
                </option>
              ))}
            </SelectField>
            <FormGrid>
              <FormField label="模板名称" name="name" placeholder="500h 小保养" />
              <FormField defaultValue="500" label="工时阈值" name="thresholdHours" />
              <FormField defaultValue="0.9" label="提前提醒比例" name="advanceRatio" />
              <FormField defaultValue="2" label="预计工时" name="laborHours" />
            </FormGrid>
            <FormField
              defaultValue='[{"part":"机油滤芯","qty":1}]'
              label="配件包 JSON"
              name="partPackageJson"
            />
            <Button>保存模板</Button>
          </form>
        </Card>
        <Card>
          <Table>
            <thead className="bg-zinc-50 text-xs text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th className="px-4 py-3 font-medium">模板</th>
                <th className="px-4 py-3 font-medium">机型</th>
                <th className="px-4 py-3 font-medium">阈值</th>
                <th className="px-4 py-3 font-medium">配件包</th>
                <th className="px-4 py-3 font-medium">状态</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr className="border-t border-zinc-100 dark:border-zinc-900" key={String(row.id)}>
                  <td className="px-4 py-3">{String(row.name)}</td>
                  <td className="px-4 py-3">{String(row.manufacturer)} · {String(row.model)}</td>
                  <td className="px-4 py-3">{String(row.threshold_hours)}h</td>
                  <td className="px-4 py-3 text-xs text-zinc-500">{String(row.part_package_json)}</td>
                  <td className="px-4 py-3"><StatusBadge status={String(row.status)} /></td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </section>
    </div>
  );
}
