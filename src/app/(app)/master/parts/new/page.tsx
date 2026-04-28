import {
  Button,
  FormCard,
  FormField,
  FormGrid,
  PageHeader,
  SelectField,
} from "@/components/phase1";
import { createPartAction } from "@/server/phase1/actions";

export default function NewPartPage() {
  return (
    <div>
      <PageHeader
        description="录入核心 SKU 字段，后续可在详情页查看适配关系和库存流水。"
        title="新建配件"
      />
      <form action={createPartAction}>
        <FormCard>
          <FormGrid>
            <FormField label="配件编码" name="code" placeholder="P-1003" />
            <FormField label="配件名称" name="name" placeholder="柴油滤芯" />
            <FormField label="厂家件号" name="oemCode" />
            <FormField label="分类" name="category" placeholder="发动机系/滤清器" />
            <FormField label="品牌" name="brand" />
            <SelectField label="三包属性" name="warrantyType">
              <option value="NORMAL">普通件</option>
              <option value="WEAR">易损件</option>
              <option value="THREE_GUARANTEE">三包件</option>
            </SelectField>
            <FormField defaultValue="0" label="采购参考价" name="refPurchasePrice" />
            <FormField defaultValue="0" label="销售指导价" name="refSalesPrice" />
            <FormField defaultValue="0" label="安全库存" name="safetyStock" type="number" />
          </FormGrid>
          <label className="flex items-center gap-2 text-sm">
            <input name="hasSerial" type="checkbox" />
            管控序列号
          </label>
          <Button>保存配件</Button>
        </FormCard>
      </form>
    </div>
  );
}
