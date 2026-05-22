import Link from "next/link";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LevelBadge } from "@/components/level-badge";
import { LEVEL_LABEL } from "@/lib/strategies/types";
import { TriggerCheckButton } from "./_components/trigger-check-button";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [symbolCount, strategyCount, enabledStrategyCount, signals, recentSignalCount] = await Promise.all([
    prisma.symbol.count(),
    prisma.strategy.count(),
    prisma.strategy.count({ where: { enabled: true } }),
    prisma.strategySignal.findMany({
      orderBy: { triggeredAt: "desc" },
      take: 20,
      include: { strategy: true, symbol: true },
    }),
    prisma.strategySignal.count({ where: { triggeredAt: { gt: new Date(Date.now() - 30 * 86400_000) } } }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">总览</h1>
        <div className="flex gap-2">
          <TriggerCheckButton />
          <Button asChild variant="outline"><Link href="/watchlist">管理监控</Link></Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat title="股票数" value={symbolCount} />
        <Stat title="策略数" value={strategyCount} hint={`${enabledStrategyCount} 启用中`} />
        <Stat title="近 30 天信号" value={recentSignalCount} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>最近信号</CardTitle>
          <CardDescription>最近 20 次转多 / 转空触发</CardDescription>
        </CardHeader>
        <CardContent>
          {signals.length === 0 ? (
            <p className="text-sm text-muted-foreground">还没有信号记录。</p>
          ) : (
            <div className="divide-y">
              {signals.map((sig) => {
                let snap: { description?: string } = {};
                try { snap = JSON.parse(sig.snapshot); } catch { /* ignore */ }
                return (
                  <div key={sig.id} className="py-3 flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-sm">
                        <Link href={`/watchlist/${sig.symbolId}`} className="font-medium hover:underline">{sig.symbol.ticker}</Link>
                        <span className="text-muted-foreground">·</span>
                        <span>{sig.strategy.name}</span>
                        <span className="text-xs text-muted-foreground">{LEVEL_LABEL[sig.prevLevel as keyof typeof LEVEL_LABEL]} →</span>
                        <LevelBadge level={sig.level} />
                        {sig.pushed ? (
                          <span className="ml-1 text-xs rounded bg-green-100 text-green-700 px-1.5 py-0.5">已推送</span>
                        ) : (
                          <span className="ml-1 text-xs rounded bg-amber-100 text-amber-700 px-1.5 py-0.5">未推送</span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">{snap.description ?? "—"}</div>
                      {sig.pushError ? <div className="text-xs text-red-600 mt-1">{sig.pushError}</div> : null}
                    </div>
                    <div className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(sig.triggeredAt).toLocaleString("zh-CN", { hour12: false })}
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
