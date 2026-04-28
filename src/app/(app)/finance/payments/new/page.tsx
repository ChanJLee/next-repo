import {
  Button,
  FormCard,
  FormField,
  FormGrid,
  PageHeader,
  SelectField,
} from "@/components/phase1";
import { getCurrentSession } from "@/server/auth/current-session";
import { createPaymentAction } from "@/server/phase1/actions";
import { listCustomers } from "@/server/phase1/service";

export default async function NewPaymentPage() {
  const session = await getCurrentSession();
  const customers = session ? listCustomers(session) : [];

  return (
    <div>
      <PageHeader description="收款默认按客户应收 FIFO 核销。" title="登记收款" />
      <form action={createPaymentAction}>
        <FormCard>
          <FormGrid>
            <SelectField label="客户" name="customerId">
              {customers.map((row) => (
                <option key={String(row.id)} value={String(row.id)}>{String(row.name)}</option>
              ))}
            </SelectField>
            <FormField defaultValue="0" label="收款金额" name="amount" />
            <SelectField label="收款方式" name="paymentMethod">
              <option value="BANK">银行转账</option>
              <option value="CASH">现金</option>
              <option value="WECHAT">微信</option>
              <option value="ALIPAY">支付宝</option>
            </SelectField>
          </FormGrid>
          <FormField label="备注" name="note" />
          <Button>保存并核销</Button>
        </FormCard>
      </form>
    </div>
  );
}
