import Link from "next/link";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TriggerCheckButton } from "./_components/trigger-check-button";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [symbolCount, ruleCount, enabledRuleCount, alerts] = await Promise.all([
    prisma.symbol.count(),
    prisma.rule.count(),
    prisma.rule.count({ where: { enabled: true } }),
    prisma.alert.findMany({
      orderBy: { triggeredAt: "desc" },
      take: 20,
      include: { rule: true, symbol: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">总览</h1>
        <div className="flex gap-2">
          <TriggerCheckButton />
          <Button asChild variant="outline">
            <Link href="/watchlist">管理监控</Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat title="股票数" value={symbolCount} />
        <Stat title="规则数" value={ruleCount} hint={`${enabledRuleCount} 启用中`} />
        <Stat title="近 30 天告警" value={await prisma.alert.count({ where: { triggeredAt: { gt: new Date(Date.now() - 30 * 86400_000) } } })} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>最近告警</CardTitle>
          <CardDescription>最近 20 条触发记录</CardDescription>
        </CardHeader>
        <CardContent>
          {alerts.length === 0 ? (
            <p className="text-sm text-muted-foreground">还没有告警记录。</p>
          ) : (
            <div className="divide-y">
              {alerts.map((a) => {
                let snap: { description?: string; quote?: { price?: number; changePercent?: number } } = {};
                try { snap = JSON.parse(a.snapshot); } catch { /* ignore */ }
                return (
                  <div key={a.id} className="py-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-medium">{a.symbol.ticker}</span>
                        <span className="text-muted-foreground">·</span>
                        <span>{a.rule.name}</span>
                        {a.pushed ? (
                          <span className="ml-1 text-xs rounded bg-green-100 text-green-700 px-1.5 py-0.5">已推送</span>
                        ) : (
                          <span className="ml-1 text-xs rounded bg-amber-100 text-amber-700 px-1.5 py-0.5">未推送</span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">{snap.description ?? "—"}</div>
                      {a.pushError ? <div className="text-xs text-red-600 mt-1">{a.pushError}</div> : null}
                    </div>
                    <div className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(a.triggeredAt).toLocaleString("zh-CN", { hour12: false })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ title, value, hint }: { title: string; value: number; hint?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-3xl">{value}</CardTitle>
      </CardHeader>
      {hint ? <CardContent className="text-xs text-muted-foreground pt-0">{hint}</CardContent> : null}
    </Card>
  );
}
