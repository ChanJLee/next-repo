import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";
import { LevelBadge } from "@/components/level-badge";
import { LEVEL_LABEL } from "@/lib/strategies/types";
import { SymbolChartPanel } from "./_components/chart-panel";
import { BackfillButton } from "./_components/backfill-button";
import { StrategiesPanel } from "./_components/strategies-panel";
import { MarketModelPanel } from "./_components/market-model-panel";
import { PositionSignalsPanel } from "./_components/position-signals-panel";
import { FactorBadge } from "./_components/factor-badge";
import { getFactorRank, factorMeta } from "@/lib/factor";

export const dynamic = "force-dynamic";

export default async function SymbolDetailPage({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isFinite(id)) notFound();

  const sym = await prisma.symbol.findUnique({
    where: { id },
    include: {
      strategies: { orderBy: { createdAt: "desc" } },
      signals: { orderBy: { triggeredAt: "desc" }, take: 10, include: { strategy: true } },
      _count: { select: { candles: true } },
    },
  });
  if (!sym) notFound();

  const enabledStrategies = sym.strategies.filter((s) => s.enabled).map((s) => ({ id: s.id, name: s.name, kind: s.kind, params: s.params }));
  const factorRank = getFactorRank(sym.ticker);
  const fMeta = factorMeta();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon">
            <Link href="/watchlist" aria-label="返回">
              <ChevronLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-semibold">
              {sym.ticker}
              {sym.name ? <span className="ml-3 text-base font-normal text-muted-foreground">{sym.name}</span> : null}
            </h1>
            <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
              <span>{sym.strategies.length} 条策略 · 缓存 {sym._count.candles} 条日线 · {sym.enabled ? "启用" : "停用"}</span>
              <FactorBadge ticker={sym.ticker} />
            </div>
          </div>
        </div>
        <BackfillButton symbolId={sym.id} />
      </div>

      <SymbolChartPanel symbolId={sym.id} ticker={sym.ticker} strategies={enabledStrategies} />

      <PositionSignalsPanel symbolId={sym.id} />

      <MarketModelPanel
        symbolId={sym.id}
        strategies={enabledStrategies}
        factorRank={factorRank}
        factorAsOf={fMeta.asOf}
        factorUniverse={fMeta.universeSize}
      />

      <StrategiesPanel
        symbolId={sym.id}
        ticker={sym.ticker}
        initial={sym.strategies.map((s) => ({
          id: s.id,
          name: s.name,
          kind: s.kind,
          params: s.params,
          currentLevel: s.currentLevel,
          enabled: s.enabled,
          cooldownSec: s.cooldownSec,
          lastEvalAt: s.lastEvalAt?.toISOString() ?? null,
        }))}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">最近信号</CardTitle>
          <CardDescription>该股票最近 10 次转多 / 转空触发</CardDescription>
        </CardHeader>
        <CardContent>
          {sym.signals.length === 0 ? (
            <p className="text-sm text-muted-foreground">还没有信号记录。</p>
          ) : (
            <div className="divide-y">
              {sym.signals.map((sig) => {
                let snap: { description?: string } = {};
                try { snap = JSON.parse(sig.snapshot); } catch { /* ignore */ }
                return (
                  <div key={sig.id} className="py-2 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">{sig.strategy.name}</span>
                          <span className="text-xs text-muted-foreground">{LEVEL_LABEL[sig.prevLevel as keyof typeof LEVEL_LABEL]} →</span>
                          <LevelBadge level={sig.level} />
                          {sig.pushed ? (
                            <span className="ml-1 text-xs rounded bg-green-100 text-green-700 px-1.5 py-0.5">已推送</span>
                          ) : (
                            <span className="ml-1 text-xs rounded bg-amber-100 text-amber-700 px-1.5 py-0.5">未推送</span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground truncate mt-0.5">{snap.description ?? "—"}</div>
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(sig.triggeredAt).toLocaleString("zh-CN", { hour12: false })}
                      </span>
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
