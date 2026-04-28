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
import { createApprovalFlowAction } from "@/server/phase3/actions";
import { getApprovalFlowCanvas, listApprovalFlows } from "@/server/phase3/service";

export default async function WorkflowsPage() {
  const session = await getCurrentSession();
  const flows = session ? listApprovalFlows(session) : [];
  const activeCanvas =
    session && flows[0] ? getApprovalFlowCanvas(session, String(flows[0].id)) : null;

  return (
    <div>
      <PageHeader
        description="按单据类型和条件配置审批流，V1 先提供节点、连线和条件的可视化画布。"
        title="审批流设计器"
      />
      <section className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <Card>
          <h2 className="mb-4 font-semibold">新增审批流</h2>
          <form action={createApprovalFlowAction} className="space-y-4">
            <FormGrid>
              <FormField label="流程名称" name="name" />
              <FormField label="流程编码" name="code" />
              <SelectField label="单据类型" name="documentType">
                <option value="SALES_ORDER">销售订单</option>
                <option value="PURCHASE_ORDER">采购订单</option>
                <option value="WARRANTY_CLAIM">三包索赔</option>
                <option value="SUBSIDY_LEDGER">补贴台账</option>
              </SelectField>
            </FormGrid>
            <label className="space-y-2 text-sm">
              <span className="font-medium">触发条件 JSON</span>
              <textarea
                className="min-h-24 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950"
                defaultValue='{"totalAmountGte":"50000"}'
                name="conditionJson"
              />
            </label>
            <Button>生成流程骨架</Button>
          </form>
        </Card>

        <Card>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-semibold">流程画布</h2>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                展示最新流程的节点与连线。
              </p>
            </div>
            {activeCanvas ? <StatusBadge status={String(activeCanvas.flow.status)} /> : null}
          </div>
          <div className="relative h-80 overflow-hidden rounded-xl bg-zinc-50 dark:bg-zinc-900">
            {activeCanvas?.edges.map((edge) => {
              const source = activeCanvas.nodes.find(
                (node) => String(node.node_key) === String(edge.source_node_key),
              );
              const target = activeCanvas.nodes.find(
                (node) => String(node.node_key) === String(edge.target_node_key),
              );
              if (!source || !target) return null;

              const left = Number(source.x) + 132;
              const width = Math.max(Number(target.x) - Number(source.x) - 132, 24);

              return (
                <div
                  className="absolute h-0.5 bg-zinc-300 dark:bg-zinc-700"
                  key={String(edge.id)}
                  style={{ left, top: Number(source.y) + 25, width }}
                  title={String(edge.condition_label)}
                />
              );
            })}
            {activeCanvas?.nodes.map((node) => (
              <div
                className="absolute w-32 rounded-xl border border-zinc-200 bg-white p-3 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
                key={String(node.id)}
                style={{ left: Number(node.x), top: Number(node.y) }}
              >
                <p className="text-xs text-zinc-500">{String(node.node_type)}</p>
                <p className="mt-1 text-sm font-medium">{String(node.title)}</p>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <Card className="mt-6">
        <Table>
          <thead className="bg-zinc-50 text-xs text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th className="px-4 py-3 font-medium">流程</th>
              <th className="px-4 py-3 font-medium">单据类型</th>
              <th className="px-4 py-3 font-medium">条件</th>
              <th className="px-4 py-3 font-medium">节点 / 连线</th>
              <th className="px-4 py-3 font-medium">状态</th>
            </tr>
          </thead>
          <tbody>
            {flows.map((flow) => (
              <tr className="border-t border-zinc-100 dark:border-zinc-900" key={String(flow.id)}>
                <td className="px-4 py-3">{String(flow.name)}</td>
                <td className="px-4 py-3">{String(flow.document_type)}</td>
                <td className="px-4 py-3 text-xs text-zinc-500">{String(flow.condition_json)}</td>
                <td className="px-4 py-3">
                  {String(flow.nodeCount)} / {String(flow.edgeCount)}
                </td>
                <td className="px-4 py-3"><StatusBadge status={String(flow.status)} /></td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
