import {
  Button,
  FormCard,
  FormField,
  FormGrid,
  PageHeader,
  SelectField,
} from "@/components/phase1";
import { getCurrentSession } from "@/server/auth/current-session";
import { createSalesOrderAction } from "@/server/phase1/actions";
import {
  listCustomerMachines,
  listCustomers,
  listParts,
  listWarehouses,
} from "@/server/phase1/service";

export default async function NewSalesOrderPage() {
  const session = await getCurrentSession();
  const customers = session ? listCustomers(session) : [];
  const machines = session ? listCustomerMachines(session) : [];
  const warehouses = session ? listWarehouses(session) : [];
  const parts = session ? listParts(session) : [];

  return (
    <div>
      <PageHeader
        description="三包件必须选择客户机器并登记序列号；审核时执行信用和库存校验。"
        title="新建销售订单"
      />
      <form action={createSalesOrderAction}>
        <FormCard>
          <FormGrid>
            <SelectField label="客户" name="customerId">
              {customers.map((row) => (
                <option key={String(row.id)} value={String(row.id)}>{String(row.name)}</option>
              ))}
            </SelectField>
            <SelectField label="客户机器" name="customerMachineId">
              <option value="">非三包件可不选</option>
              {machines.map((row) => (
                <option key={String(row.id)} value={String(row.id)}>
                  {String(row.customerName)} · {String(row.model)} · {String(row.factory_serial)}
                </option>
              ))}
            </SelectField>
            <SelectField label="配件" name="partId">
              {parts.map((row) => (
                <option key={String(row.id)} value={String(row.id)}>{String(row.code)} · {String(row.name)}</option>
              ))}
            </SelectField>
            <SelectField label="出库仓库" name="warehouseId">
              {warehouses.map((row) => (
                <option key={String(row.id)} value={String(row.id)}>{String(row.name)}</option>
              ))}
            </SelectField>
            <FormField defaultValue="1" label="销售数量" name="qty" />
            <FormField defaultValue="0" label="销售单价" name="unitPrice" />
            <FormField label="三包序列号" name="warrantySerial" />
          </FormGrid>
          <FormField label="备注" name="note" />
          <Button>保存销售订单</Button>
        </FormCard>
      </form>
    </div>
  );
}
