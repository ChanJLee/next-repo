import { Card, PageHeader, Table } from "@/components/phase1";
import { Badge } from "@/components/ui";
import { getCurrentSession } from "@/server/auth/current-session";
import { listPermissions, listRoles } from "@/server/phase3/service";

export default async function PermissionsPage() {
  const session = await getCurrentSession();
  const roles = session ? listRoles(session) : [];
  const permissions = listPermissions();

  return (
    <div>
      <PageHeader
        description="查看系统内置权限点，并与角色矩阵配合控制菜单、按钮、报表和系统配置能力。"
        title="权限点"
      />

      <section className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <Card>
          <Table>
            <thead className="bg-zinc-50 text-xs text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th className="px-4 py-3 font-medium">权限编码</th>
                <th className="px-4 py-3 font-medium">名称</th>
                <th className="px-4 py-3 font-medium">说明</th>
              </tr>
            </thead>
            <tbody>
              {permissions.map((permission) => (
                <tr className="border-t border-zinc-100 dark:border-zinc-900" key={String(permission.id)}>
                  <td className="px-4 py-3 font-mono text-xs">{String(permission.code)}</td>
                  <td className="px-4 py-3">{String(permission.name)}</td>
                  <td className="px-4 py-3 text-zinc-500">{String(permission.description)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>

        <Card>
          <h2 className="mb-4 font-semibold">角色覆盖</h2>
          <div className="space-y-3">
            {roles.map((role) => (
              <div
                className="rounded-lg bg-zinc-50 p-3 text-sm dark:bg-zinc-900"
                key={String(role.id)}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">{String(role.name)}</span>
                  <Badge>{String(role.permissionCount)} 项</Badge>
                </div>
                <p className="mt-1 text-xs text-zinc-500">数据范围：{String(role.data_scope)}</p>
              </div>
            ))}
          </div>
        </Card>
      </section>
    </div>
  );
}
