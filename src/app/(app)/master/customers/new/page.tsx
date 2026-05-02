import {
  Button,
  FormCard,
  FormField,
  FormGrid,
  PageHeader,
  SelectField,
} from "@/components/phase1";
import { SafeForm } from "@/components/safe-form";
import { createCustomerAction } from "@/server/phase1/actions";

export default function NewCustomerPage() {
  return (
    <div>
      <PageHeader description="新增客户后可在销售订单中启用信用控制。" title="新建客户" />
      <SafeForm action={createCustomerAction}>
        <FormCard>
          <FormGrid>
            <FormField label="客户编码" name="code" placeholder="CUS-002" />
            <FormField label="客户名称" name="name" />
            <SelectField label="客户类型" name="customerType">
              <option value="FARMER">农机大户</option>
              <option value="COOP">合作社</option>
              <option value="FARM_ENTERPRISE">农场企业</option>
              <option value="REPAIR_SHOP">维修站</option>
              <option value="DEALER">经销商</option>
            </SelectField>
            <SelectField label="客户等级" name="level">
              <option value="NORMAL">普通</option>
              <option value="SILVER">银卡</option>
              <option value="GOLD">金卡</option>
              <option value="VIP">VIP</option>
            </SelectField>
            <FormField label="联系人" name="contactName" />
            <FormField label="电话" name="phone" />
            <FormField defaultValue="0" label="信用额度" name="creditLimit" />
            <FormField defaultValue="0" label="账期天数" name="paymentTermDays" type="number" />
          </FormGrid>
          <FormField label="地址" name="address" />
          <Button>保存客户</Button>
        </FormCard>
      </SafeForm>
    </div>
  );
}
