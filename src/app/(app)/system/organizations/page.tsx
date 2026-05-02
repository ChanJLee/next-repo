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
import { SafeForm } from "@/components/safe-form";
import { getCurrentSession } from "@/server/auth/current-session";
import { createOrganizationAction } from "@/server/phase3/actions";
import { listOrganizations } from "@/server/phase3/service";

const orgTypeLabels: Record<string, string> = {
  GROUP: "集团",
  REGION: "大区",
  DEALER: "经销商",
  STORE: "门店",
  TEAM: "班组",
};

export default async function OrganizationsPage() {
  const session = await getCurrentSession();
  const rows = session ? listOrganizations(session) : [];

  return (
    <div>
      <PageHeader
        description="维护集团、大区、门店、班组四级组织树，为数据权限和业务单据归属提供基础。"
        title="组织管理"
      />
      <Card className="mb-6">
        <h2 className="mb-4 font-semibold">新增组织</h2>
        <SafeForm action={createOrganizationAction} className="space-y-4">
          <FormGrid>
            <SelectField label="上级组织" name="parentId">
              <option value="">作为一级组织</option>
              {rows.map((row) => (
                <option key={String(row.id)} value={String(row.id)}>
                  {"　".repeat(Math.max(Number(row.level) - 1, 0))}
                  {String(row.name)}
                </option>
              ))}
            </SelectField>
            <SelectField label="组织类型" name="orgType">
              <option value="GROUP">集团</option>
              <option value="REGION">大区</option>
              <option value="DEALER">经销商</option>
              <option value="STORE">门店</option>
              <option value="TEAM">班组</option>
            </SelectField>
            <FormField label="组织名称" name="name" />
            <FormField label="组织编码" name="code" />
          </FormGrid>
          <Button>保存组织</Button>
        </SafeForm>
      </Card>
      <Card>
        <Table>
          <thead className="bg-zinc-50 text-xs text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th className="px-4 py-3 font-medium">层级</th>
              <th className="px-4 py-3 font-medium">组织</th>
              <th className="px-4 py-3 font-medium">编码</th>
              <th className="px-4 py-3 font-medium">类型</th>
              <th className="px-4 py-3 font-medium">状态</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr className="border-t border-zinc-100 dark:border-zinc-900" key={String(row.id)}>
                <td className="px-4 py-3">L{String(row.level)}</td>
                <td className="px-4 py-3">
                  <span style={{ paddingLeft: `${(Number(row.level) - 1) * 18}px` }}>
                    {String(row.name)}
                  </span>
                </td>
                <td className="px-4 py-3">{String(row.code)}</td>
                <td className="px-4 py-3">{orgTypeLabels[String(row.org_type)] ?? String(row.org_type)}</td>
                <td className="px-4 py-3"><StatusBadge status={String(row.status)} /></td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
