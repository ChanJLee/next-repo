import { notFound } from "next/navigation";

import {
  Button,
  Card,
  DetailTabs,
  Field,
  FormField,
  FormGrid,
  PageHeader,
  Select,
  StatusBadge,
  Table,
} from "@/components/phase1";
import { SafeForm } from "@/components/safe-form";
import { getCurrentSession } from "@/server/auth/current-session";
import { listParts } from "@/server/phase1/service";
import {
  acceptServiceOrderAction,
  completeServiceOrderAction,
  dispatchServiceOrderAction,
  startServiceOrderAction,
} from "@/server/phase2/actions";
import { getServiceOrderDetail } from "@/server/phase2/service";

export default async function ServiceOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getCurrentSession();
  const { id } = await params;
  const detail = session ? getServiceOrderDetail(session, id) : null;
  const parts = session ? listParts(session).filter((row) => row.warranty_type === "THREE_GUARANTEE") : [];
  if (!detail) {
    notFound();
  }

  const order = detail.order;

  return (
    <div>
      <PageHeader
        action={<StatusBadge status={String(order.status)} />}
        description="按待派单、已派单、已接单、服务中、已完成推进；完成时自动写机器档案和应收。"
        title={String(order.code)}
      />
      <DetailTabs />
      <Card className="mb-6 grid gap-4 md:grid-cols-4">
        <Field label="客户">{String(order.customerName)}</Field>
        <Field label="机器">{String(order.factorySerial ?? "-")}</Field>
        <Field label="机型">{String(order.model ?? "-")}</Field>
        <Field label="工程师">{String(order.assigned_engineer_name || "未派单")}</Field>
        <Field label="故障">{String(order.fault_description)}</Field>
        <Field label="位置">
          {String(order.latitude || "-")}, {String(order.longitude || "-")}
        </Field>
        <Field label="工时 / 亩数">
          {String(order.current_hours)}h / {String(order.current_acres)}
        </Field>
        <Field label="费用">¥ {String(order.total_amount)}</Field>
      </Card>

      <section className="mb-6 grid gap-4 xl:grid-cols-2">
        <Card>
          <h2 className="mb-4 font-semibold">状态操作</h2>
          <div className="space-y-3">
            <SafeForm action={dispatchServiceOrderAction} className="flex gap-2">
              <input name="id" type="hidden" value={id} />
              <input
                className="h-9 flex-1 rounded-lg border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                name="engineerName"
                placeholder="工程师姓名"
              />
              <Button disabled={String(order.status) !== "REPORTED"} variant="secondary">派单</Button>
            </SafeForm>
            <div className="flex gap-2">
              <SafeForm action={acceptServiceOrderAction}>
                <input name="id" type="hidden" value={id} />
                <Button disabled={String(order.status) !== "DISPATCHED"} variant="secondary">接单</Button>
              </SafeForm>
              <SafeForm action={startServiceOrderAction}>
                <input name="id" type="hidden" value={id} />
                <Button disabled={String(order.status) !== "ACCEPTED"} variant="secondary">开始服务</Button>
              </SafeForm>
            </div>
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 font-semibold">完成工单</h2>
          <SafeForm action={completeServiceOrderAction} className="space-y-4">
            <input name="id" type="hidden" value={id} />
            <FormGrid>
              <FormField defaultValue={String(order.current_hours)} label="完工工时" name="currentHours" />
              <FormField defaultValue={String(order.current_acres)} label="完工亩数" name="currentAcres" />
              <FormField defaultValue="0" label="工时费" name="laborAmount" />
              <FormField defaultValue="0" label="配件费" name="partsAmount" />
              <label className="space-y-2 text-sm">
                <span className="font-medium">故障三包件</span>
                <Select name="warrantyPartId">
                  <option value="">不生成三包索赔</option>
                  {parts.map((row) => (
                    <option key={String(row.id)} value={String(row.id)}>
                      {String(row.code)} · {String(row.name)}
                    </option>
                  ))}
                </Select>
              </label>
              <FormField label="故障件序列号" name="warrantySerial" />
            </FormGrid>
            <FormField defaultValue="现场签字已确认" label="客户签字预览" name="customerSignature" />
            <label className="space-y-2 text-sm">
              <span className="font-medium">处理结果</span>
              <textarea
                className="min-h-24 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950"
                name="resolutionNote"
                placeholder="故障原因、维修过程、更换配件"
              />
            </label>
            <Button disabled={String(order.status) !== "IN_SERVICE"}>完成并联动</Button>
          </SafeForm>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <Card>
          <h2 className="mb-4 font-semibold">工单时间线</h2>
          <Table>
            <tbody>
              {detail.events.map((row) => (
                <tr className="border-t border-zinc-100 dark:border-zinc-900" key={String(row.id)}>
                  <td className="px-4 py-3">{String(row.title)}</td>
                  <td className="px-4 py-3 text-zinc-500">{String(row.description)}</td>
                  <td className="px-4 py-3 text-zinc-500">{String(row.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
        <Card>
          <h2 className="mb-4 font-semibold">关联三包索赔</h2>
          <Table>
            <tbody>
              {detail.claims.map((row) => (
                <tr className="border-t border-zinc-100 dark:border-zinc-900" key={String(row.id)}>
                  <td className="px-4 py-3">{String(row.code)}</td>
                  <td className="px-4 py-3">{String(row.partCode)} · {String(row.partName)}</td>
                  <td className="px-4 py-3"><StatusBadge status={String(row.status)} /></td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </section>
    </div>
  );
}
