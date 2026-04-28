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
import { Badge } from "@/components/ui";
import { getCurrentSession } from "@/server/auth/current-session";
import { createUserAction } from "@/server/phase3/actions";
import { listOrganizations, listRoles, listUsers } from "@/server/phase3/service";

export default async function UsersPage() {
  const session = await getCurrentSession();
  const users = session ? listUsers(session) : [];
  const organizations = session ? listOrganizations(session) : [];
  const roles = session ? listRoles(session) : [];

  return (
    <div>
      <PageHeader
        description="维护登录账号、所属组织和角色授权，权限在服务层按会话统一校验。"
        title="用户管理"
      />

      <Card className="mb-6">
        <h2 className="mb-4 font-semibold">新增用户</h2>
        <form action={createUserAction} className="space-y-4">
          <FormGrid>
            <FormField label="登录名" name="username" />
            <FormField label="姓名" name="name" />
            <FormField label="初始密码" name="password" type="password" />
            <SelectField label="所属组织" name="orgId">
              {organizations.map((org) => (
                <option key={String(org.id)} value={String(org.id)}>
                  {"　".repeat(Math.max(Number(org.level) - 1, 0))}
                  {String(org.name)}
                </option>
              ))}
            </SelectField>
            <SelectField label="状态" name="status">
              <option value="ACTIVE">启用</option>
              <option value="DISABLED">停用</option>
            </SelectField>
          </FormGrid>
          <div>
            <p className="mb-2 text-sm font-medium">角色</p>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {roles.map((role) => (
                <label
                  className="flex items-center gap-2 rounded-lg border border-zinc-200 p-3 text-sm dark:border-zinc-800"
                  key={String(role.id)}
                >
                  <input name="roleIds" type="checkbox" value={String(role.id)} />
                  <span>{String(role.name)}</span>
                  <Badge>{String(role.data_scope)}</Badge>
                </label>
              ))}
            </div>
          </div>
          <Button>保存用户</Button>
        </form>
      </Card>

      <Card>
        <Table>
          <thead className="bg-zinc-50 text-xs text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th className="px-4 py-3 font-medium">用户</th>
              <th className="px-4 py-3 font-medium">登录名</th>
              <th className="px-4 py-3 font-medium">组织</th>
              <th className="px-4 py-3 font-medium">角色</th>
              <th className="px-4 py-3 font-medium">状态</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr className="border-t border-zinc-100 dark:border-zinc-900" key={String(user.id)}>
                <td className="px-4 py-3">{String(user.name)}</td>
                <td className="px-4 py-3">{String(user.username)}</td>
                <td className="px-4 py-3">{String(user.orgName)}</td>
                <td className="px-4 py-3">{String(user.roleNames ?? "-")}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={String(user.status)} />
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
