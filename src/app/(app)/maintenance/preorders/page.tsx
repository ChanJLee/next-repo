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
import { SafeForm } from "@/components/safe-form";
import { getCurrentSession } from "@/server/auth/current-session";
import { listCustomerMachines } from "@/server/phase1/service";
import {
  confirmMaintenancePreorderAction,
  convertMaintenancePreorderAction,
  createMaintenancePreorderAction,
} from "@/server/phase2/actions";
import {
  listMaintenancePreorders,
  listMaintenanceTemplates,
} from "@/server/phase2/service";

export default async function MaintenancePreordersPage() {
  const session = await getCurrentSession();
  const rows = session ? listMaintenancePreorders(session) : [];
  const templates = session ? listMaintenanceTemplates(session) : [];
  const machines = session ? listCustomerMachines(session) : [];

  return (
    <div>
      <PageHeader
        description="系统生成后由客户确认，确认后可一键转服务工单。"
        title="保养预订单"
      />
      <Card className="mb-6">
        <h2 className="mb-4 font-semibold">生成预订单</h2>
        <SafeForm action={createMaintenancePreorderAction} className="space-y-4">
          <FormGrid>
            <SelectField label="保养模板" name="maintenanceTemplateId">
              {templates.map((row) => (
                <option key={String(row.id)} value={String(row.id)}>
                  {String(row.name)} · {String(row.threshold_hours)}h
                </option>
              ))}
            </SelectField>
            <SelectField label="客户机器" name="customerMachineId">
              {machines.map((row) => (
                <option key={String(row.id)} value={String(row.id)}>
                  {String(row.customerName)} · {String(row.model)} · {String(row.factory_serial)}
                </option>
              ))}
            </SelectField>
            <FormField defaultValue="0" label="报价金额" name="quoteAmount" />
            <FormField label="预计服务日期" name="expectedServiceDate" type="date" />
          </FormGrid>
          <FormField label="备注" name="note" />
          <Button>生成预订单</Button>
        </SafeForm>
      </Card>
      <Card>
        <Table>
          <thead className="bg-zinc-50 text-xs text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th className="px-4 py-3 font-medium">预订单</th>
              <th className="px-4 py-3 font-medium">客户 / 机器</th>
              <th className="px-4 py-3 font-medium">模板</th>
              <th className="px-4 py-3 font-medium">报价</th>
              <th className="px-4 py-3 font-medium">状态</th>
              <th className="px-4 py-3 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr className="border-t border-zinc-100 dark:border-zinc-900" key={String(row.id)}>
                <td className="px-4 py-3">{String(row.code)}</td>
                <td className="px-4 py-3">
                  {String(row.customerName)}
                  <p className="mt-1 text-xs text-zinc-500">{String(row.factorySerial)}</p>
                </td>
                <td className="px-4 py-3">{String(row.templateName)}</td>
                <td className="px-4 py-3">¥ {String(row.quote_amount)}</td>
                <td className="px-4 py-3"><StatusBadge status={String(row.status)} /></td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <SafeForm action={confirmMaintenancePreorderAction}>
                      <input name="id" type="hidden" value={String(row.id)} />
                      <Button disabled={String(row.status) !== "GENERATED"} variant="secondary">客户确认</Button>
                    </SafeForm>
                    <SafeForm action={convertMaintenancePreorderAction}>
                      <input name="id" type="hidden" value={String(row.id)} />
                      <Button disabled={String(row.status) !== "CONFIRMED"}>转工单</Button>
                    </SafeForm>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
