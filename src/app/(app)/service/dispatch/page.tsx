import { Card, PageHeader, StatusBadge } from "@/components/phase1";
import { getCurrentSession } from "@/server/auth/current-session";
import { listServiceOrders } from "@/server/phase2/service";

export default async function ServiceDispatchPage() {
  const session = await getCurrentSession();
  const rows = session ? listServiceOrders(session) : [];
  const columns = [
    ["REPORTED", "待派单"],
    ["DISPATCHED", "已派单"],
    ["ACCEPTED", "已接单"],
    ["IN_SERVICE", "服务中"],
  ];

  return (
    <div>
      <PageHeader
        description="地图 SDK 在 V1.5 接入，本期先用静态坐标卡片展示调度位置。"
        title="派单看板"
      />
      <section className="grid gap-4 xl:grid-cols-4">
        {columns.map(([status, title]) => (
          <Card className="min-h-96" key={status}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold">{title}</h2>
              <StatusBadge status={status} />
            </div>
            <div className="space-y-3">
              {rows
                .filter((row) => row.status === status)
                .map((row) => (
                  <article
                    className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900/50"
                    key={String(row.id)}
                  >
                    <p className="font-medium">{String(row.code)}</p>
                    <p className="mt-1 text-zinc-500">{String(row.customerName)}</p>
                    <p className="mt-2 text-xs text-zinc-500">
                      坐标：{String(row.latitude || "-")}, {String(row.longitude || "-")}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      工程师：{String(row.assigned_engineer_name || "待分配")}
                    </p>
                  </article>
                ))}
            </div>
          </Card>
        ))}
      </section>
    </div>
  );
}
