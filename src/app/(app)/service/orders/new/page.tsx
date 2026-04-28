import {
  Button,
  FormCard,
  FormField,
  FormGrid,
  PageHeader,
  SelectField,
} from "@/components/phase1";
import { getCurrentSession } from "@/server/auth/current-session";
import { listCustomerMachines, listCustomers } from "@/server/phase1/service";
import { createServiceOrderAction } from "@/server/phase2/actions";

export default async function NewServiceOrderPage() {
  const session = await getCurrentSession();
  const customers = session ? listCustomers(session) : [];
  const machines = session ? listCustomerMachines(session) : [];

  return (
    <div>
      <PageHeader
        description="录入报修渠道、故障、工时和静态坐标，后续在派单看板派给工程师。"
        title="报修录入"
      />
      <form action={createServiceOrderAction}>
        <FormCard>
          <FormGrid>
            <SelectField label="客户" name="customerId">
              {customers.map((row) => (
                <option key={String(row.id)} value={String(row.id)}>{String(row.name)}</option>
              ))}
            </SelectField>
            <SelectField label="客户机器" name="customerMachineId">
              <option value="">不关联机器</option>
              {machines.map((row) => (
                <option key={String(row.id)} value={String(row.id)}>
                  {String(row.customerName)} · {String(row.model)} · {String(row.factory_serial)}
                </option>
              ))}
            </SelectField>
            <SelectField label="报修渠道" name="sourceChannel">
              <option value="PHONE">电话报修</option>
              <option value="MINI_APP">小程序报修</option>
              <option value="SALES">销售上报</option>
              <option value="MAINTENANCE">保养自动生成</option>
            </SelectField>
            <SelectField label="紧急程度" name="urgency">
              <option value="NORMAL">普通</option>
              <option value="HIGH">紧急</option>
              <option value="EMERGENCY">农忙抢修</option>
              <option value="LOW">低</option>
            </SelectField>
            <FormField label="故障代码" name="faultCode" placeholder="如 E-101" />
            <FormField label="期望上门时间" name="expectedAt" type="datetime-local" />
            <FormField defaultValue="0" label="当前工时" name="currentHours" />
            <FormField defaultValue="0" label="当前亩数" name="currentAcres" />
            <FormField defaultValue="36.06" label="纬度（静态占位）" name="latitude" />
            <FormField defaultValue="118.34" label="经度（静态占位）" name="longitude" />
          </FormGrid>
          <label className="space-y-2 text-sm">
            <span className="font-medium">故障描述</span>
            <textarea
              className="min-h-28 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950"
              name="faultDescription"
              placeholder="描述故障现象、地点和客户诉求"
            />
          </label>
          <Button>保存工单</Button>
        </FormCard>
      </form>
    </div>
  );
}
