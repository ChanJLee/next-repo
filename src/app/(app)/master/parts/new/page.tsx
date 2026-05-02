import { PageHeader } from "@/components/phase1";

import { NewPartForm } from "./new-part-form";

export default function NewPartPage() {
  return (
    <div>
      <PageHeader
        description="录入核心 SKU 字段，后续可在详情页查看适配关系和库存流水。"
        title="新建配件"
      />
      <NewPartForm />
    </div>
  );
}
