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
import {
  listCustomerMachines,
  listCustomers,
  listSalesOrders,
} from "@/server/phase1/service";
import {
  advanceSubsidyLedgerAction,
  createSubsidyLedgerAction,
} from "@/server/phase2/actions";
import { listSubsidyLedgers } from "@/server/phase2/service";

export default async function SubsidyLedgersPage() {
  const session = await getCurrentSession();
  const rows = session ? listSubsidyLedgers(session) : [];
  const salesOrders = session ? listSalesOrders(session) : [];
  const customers = session ? listCustomers(session) : [];
  const machines = session ? listCustomerMachines(session) : [];

  return (
    <div>
      <PageHeader
        description="销售单标记补贴后沉淀台账，校验身份证、出厂号、银行卡和申请表资料。"
        title="政府补贴台账"
      />
      <Card className="mb-6">
        <h2 className="mb-4 font-semibold">新增台账</h2>
        <form action={createSubsidyLedgerAction} className="space-y-4">
          <FormGrid>
            <SelectField label="关联销售单" name="salesOrderId">
              <option value="">不关联销售单</option>
              {salesOrders.map((row) => (
                <option key={String(row.id)} value={String(row.id)}>
                  {String(row.code)} · {String(row.customerName)}
                </option>
              ))}
            </SelectField>
            <SelectField label="客户" name="customerId">
              {customers.map((row) => (
                <option key={String(row.id)} value={String(row.id)}>{String(row.name)}</option>
              ))}
            </SelectField>
            <SelectField label="客户机器" name="customerMachineId">
              <option value="">不关联机器</option>
              {machines.map((row) => (
                <option key={String(row.id)} value={String(row.id)}>
                  {String(row.customerName)} · {String(row.factory_serial)}
                </option>
              ))}
            </SelectField>
            <SelectField label="政策类型" name="policyType">
              <option value="PURCHASE">购置补贴</option>
              <option value="SCRAP_RENEWAL">报废更新</option>
              <option value="LOCAL">地方补贴</option>
            </SelectField>
            <FormField defaultValue="0" label="补贴金额" name="subsidyAmount" />
            <FormField defaultValue="0" label="补贴比例" name="subsidyRatio" />
            <FormField label="客户身份证" name="customerIdNo" />
            <FormField label="机器出厂号" name="machineSerial" />
            <FormField label="银行卡号" name="bankAccount" />
            <FormField label="申请表附件" name="applicationFile" />
          </FormGrid>
          <FormField label="备注" name="note" />
          <Button>保存台账</Button>
        </form>
      </Card>
      <Card>
        <Table>
          <thead className="bg-zinc-50 text-xs text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th className="px-4 py-3 font-medium">台账</th>
              <th className="px-4 py-3 font-medium">客户 / 销售单</th>
              <th className="px-4 py-3 font-medium">金额</th>
              <th className="px-4 py-3 font-medium">资料</th>
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
                  <p className="mt-1 text-xs text-zinc-500">{String(row.salesOrderCode ?? "-")}</p>
                </td>
                <td className="px-4 py-3">¥ {String(row.subsidy_amount)}</td>
                <td className="px-4 py-3">{Number(row.material_complete) ? "完整" : "待补齐"}</td>
                <td className="px-4 py-3"><StatusBadge status={String(row.status)} /></td>
                <td className="px-4 py-3">
                  <form action={advanceSubsidyLedgerAction}>
                    <input name="id" type="hidden" value={String(row.id)} />
                    <Button disabled={String(row.status) === "PAID_SUBSIDY"} variant="secondary">推进申报</Button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
