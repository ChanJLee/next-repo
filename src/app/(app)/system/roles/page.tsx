import {
  Button,
  Card,
  FormField,
  FormGrid,
  PageHeader,
  SelectField,
  Table,
} from "@/components/phase1";
import { SafeForm } from "@/components/safe-form";
import { Badge } from "@/components/ui";
import { getCurrentSession } from "@/server/auth/current-session";
import { createRoleAction } from "@/server/phase3/actions";
import {
  listPermissions,
  listRoleFieldPermissions,
  listRoles,
} from "@/server/phase3/service";

const sensitiveFields = [
  ["cost_price", "成本价"],
  ["credit_limit", "信用额度"],
  ["customer_id_no", "身份证号"],
  ["bank_account", "银行账户"],
];

export default async function RolesPage() {
  const session = await getCurrentSession();
  const roles = session ? listRoles(session) : [];
  const permissions = listPermissions();
  const fieldPermissions = session ? listRoleFieldPermissions(session) : [];

  return (
    <div>
      <PageHeader
        description="用菜单 / 按钮权限、数据范围和字段级权限构成角色矩阵，敏感字段由服务层按角色控制。"
        title="角色权限"
      />
      <Card className="mb-6">
        <h2 className="mb-4 font-semibold">新增角色</h2>
        <SafeForm action={createRoleAction} className="space-y-4">
          <FormGrid>
            <FormField label="角色名称" name="name" />
            <FormField label="角色编码" name="code" />
            <SelectField label="数据权限" name="dataScope">
              <option value="TENANT">全租户</option>
              <option value="ORG_TREE">本组织及下级</option>
              <option value="ORG">本组织</option>
              <option value="SELF">本人</option>
            </SelectField>
          </FormGrid>
          <div>
            <p className="mb-2 text-sm font-medium">菜单 / 按钮权限</p>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {permissions.map((permission) => (
                <label
                  className="flex items-center gap-2 rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800"
                  key={String(permission.id)}
                >
                  <input name="permissionCodes" type="checkbox" value={String(permission.code)} />
                  <span>{String(permission.name)}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium">字段级权限</p>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {sensitiveFields.map(([fieldCode, label]) => (
                <SelectField key={fieldCode} label={label} name={`field_${fieldCode}`}>
                  <option value="VISIBLE">可见</option>
                  <option value="MASKED">脱敏</option>
                  <option value="HIDDEN">隐藏</option>
                </SelectField>
              ))}
            </div>
          </div>
          <Button>保存角色</Button>
        </SafeForm>
      </Card>

      <section className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <Card>
          <Table>
            <thead className="bg-zinc-50 text-xs text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th className="px-4 py-3 font-medium">角色</th>
                <th className="px-4 py-3 font-medium">编码</th>
                <th className="px-4 py-3 font-medium">数据范围</th>
                <th className="px-4 py-3 font-medium">权限数</th>
                <th className="px-4 py-3 font-medium">字段规则</th>
              </tr>
            </thead>
            <tbody>
              {roles.map((role) => (
                <tr className="border-t border-zinc-100 dark:border-zinc-900" key={String(role.id)}>
                  <td className="px-4 py-3">{String(role.name)}</td>
                  <td className="px-4 py-3">{String(role.code)}</td>
                  <td className="px-4 py-3"><Badge>{String(role.data_scope)}</Badge></td>
                  <td className="px-4 py-3">{String(role.permissionCount)}</td>
                  <td className="px-4 py-3">{String(role.fieldPermissionCount)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
        <Card>
          <h2 className="mb-4 font-semibold">字段权限矩阵</h2>
          <div className="space-y-3">
            {fieldPermissions.map((row) => (
              <div
                className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-2 text-sm dark:bg-zinc-900"
                key={`${String(row.role_id)}-${String(row.field_code)}`}
              >
                <span>{String(row.roleName)} · {String(row.field_code)}</span>
                <Badge>{String(row.access_level)}</Badge>
              </div>
            ))}
          </div>
        </Card>
      </section>
    </div>
  );
}
