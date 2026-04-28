import {
  Button,
  FormCard,
  FormField,
  FormGrid,
  PageHeader,
  SelectField,
} from "@/components/phase1";
import { getCurrentSession } from "@/server/auth/current-session";
import { createPurchaseOrderAction } from "@/server/phase1/actions";
import { listParts, listSuppliers, listWarehouses } from "@/server/phase1/service";

export default async function NewPurchaseOrderPage() {
  const session = await getCurrentSession();
  const suppliers = session ? listSuppliers(session) : [];
  const warehouses = session ? listWarehouses(session) : [];
  const parts = session ? listParts(session) : [];

  return (
    <div>
      <PageHeader description="最小采购单支持单行明细，收货后自动入库。" title="新建采购订单" />
      <form action={createPurchaseOrderAction}>
        <FormCard>
          <FormGrid>
            <SelectField label="供应商" name="supplierId">
              {suppliers.map((row) => (
                <option key={String(row.id)} value={String(row.id)}>{String(row.name)}</option>
              ))}
            </SelectField>
            <SelectField label="收货仓库" name="warehouseId">
              {warehouses.map((row) => (
                <option key={String(row.id)} value={String(row.id)}>{String(row.name)}</option>
              ))}
            </SelectField>
            <SelectField label="配件" name="partId">
              {parts.map((row) => (
                <option key={String(row.id)} value={String(row.id)}>{String(row.code)} · {String(row.name)}</option>
              ))}
            </SelectField>
            <FormField defaultValue="1" label="采购数量" name="qty" />
            <FormField defaultValue="0" label="采购单价" name="unitPrice" />
          </FormGrid>
          <FormField label="备注" name="note" />
          <Button>保存采购订单</Button>
        </FormCard>
      </form>
    </div>
  );
}
