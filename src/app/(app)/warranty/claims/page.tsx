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
import { listCustomerMachines, listParts } from "@/server/phase1/service";
import {
  advanceWarrantyClaimAction,
  createWarrantyClaimAction,
} from "@/server/phase2/actions";
import { listServiceOrders, listWarrantyClaims } from "@/server/phase2/service";

export default async function WarrantyClaimsPage() {
  const session = await getCurrentSession();
  const rows = session ? listWarrantyClaims(session) : [];
  const serviceOrders = session ? listServiceOrders(session) : [];
  const machines = session ? listCustomerMachines(session) : [];
  const parts = session ? listParts(session).filter((row) => row.warranty_type === "THREE_GUARANTEE") : [];

  return (
    <div>
      <PageHeader
        description="关联服务工单、客户机器和故障件序列号，校验 5 项资料完整性并展示审批推进。"
        title="三包索赔"
      />
      <Card className="mb-6">
        <h2 className="mb-4 font-semibold">新建索赔单</h2>
        <form action={createWarrantyClaimAction} className="space-y-4">
          <FormGrid>
            <SelectField label="服务工单" name="serviceOrderId">
              {serviceOrders.map((row) => (
                <option key={String(row.id)} value={String(row.id)}>
                  {String(row.code)} · {String(row.customerName)}
                </option>
              ))}
            </SelectField>
            <SelectField label="客户机器" name="customerMachineId">
              {machines.map((row) => (
                <option key={String(row.id)} value={String(row.id)}>
                  {String(row.customerName)} · {String(row.factory_serial)}
                </option>
              ))}
            </SelectField>
            <SelectField label="故障件" name="failedPartId">
              {parts.map((row) => (
                <option key={String(row.id)} value={String(row.id)}>
                  {String(row.code)} · {String(row.name)}
                </option>
              ))}
            </SelectField>
            <FormField label="故障件序列号" name="failedSerial" />
            <FormField defaultValue="0" label="索赔金额" name="claimAmount" />
            <FormField label="故障件照片" name="failurePhoto" placeholder="文件名或 URL" />
            <FormField label="铭牌照片" name="nameplatePhoto" placeholder="文件名或 URL" />
            <FormField label="维修工单附件" name="repairOrderFile" placeholder="文件名或 URL" />
            <FormField label="客户签字" name="customerSignatureFile" placeholder="文件名或 URL" />
            <FormField label="购机凭证" name="purchaseProofFile" placeholder="文件名或 URL" />
          </FormGrid>
          <label className="space-y-2 text-sm">
            <span className="font-medium">故障描述</span>
            <textarea
              className="min-h-24 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950"
              name="faultDescription"
            />
          </label>
          <Button>保存索赔单</Button>
        </form>
      </Card>
      <Card>
        <Table>
          <thead className="bg-zinc-50 text-xs text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th className="px-4 py-3 font-medium">索赔单</th>
              <th className="px-4 py-3 font-medium">客户 / 机器</th>
              <th className="px-4 py-3 font-medium">故障件</th>
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
                  <p className="mt-1 text-xs text-zinc-500">{String(row.factorySerial)}</p>
                </td>
                <td className="px-4 py-3">{String(row.partCode)} · {String(row.partName)}</td>
                <td className="px-4 py-3">{Number(row.material_complete) ? "完整" : "待补齐"}</td>
                <td className="px-4 py-3"><StatusBadge status={String(row.status)} /></td>
                <td className="px-4 py-3">
                  <form action={advanceWarrantyClaimAction}>
                    <input name="id" type="hidden" value={String(row.id)} />
                    <Button
                      disabled={["SETTLED", "REJECTED"].includes(String(row.status))}
                      variant="secondary"
                    >
                      推进审批
                    </Button>
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
