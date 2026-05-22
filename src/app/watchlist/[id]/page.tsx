import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";
import { SymbolChartPanel } from "./_components/chart-panel";

export const dynamic = "force-dynamic";

export default async function SymbolDetailPage({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isFinite(id)) notFound();

  const sym = await prisma.symbol.findUnique({
    where: { id },
    include: {
      rules: { orderBy: { createdAt: "desc" } },
      alerts: { orderBy: { triggeredAt: "desc" }, take: 10, include: { rule: true } },
    },
  });
  if (!sym) notFound();

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
            <div className="text-xs text-muted-foreground mt-1">
              {sym.rules.length} 条规则 · {sym.enabled ? "启用" : "停用"}
            </div>
          </div>
        </div>
      </div>

      <SymbolChartPanel symbolId={sym.id} ticker={sym.ticker} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">规则</CardTitle>
            <CardDescription>该股票的所有监控规则</CardDescription>
          </CardHeader>
          <CardContent>
            {sym.rules.length === 0 ? (
              <p className="text-sm text-muted-foreground">还没有规则。</p>
            ) : (
              <div className="divide-y rounded-md border">
                {sym.rules.map((r) => {
                  const params = (() => { try { return JSON.parse(r.params); } catch { return {}; } })();
                  return (
                    <div key={r.id} className="px-3 py-2 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{r.name}</span>
                        {!r.enabled && <span className="text-xs rounded bg-muted px-1.5 py-0.5 text-muted-foreground">停用</span>}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 truncate">
                        {r.indicator}{Object.keys(params).length ? ` · ${JSON.stringify(params)}` : ""} · 冷却 {Math.round(r.cooldownSec / 60)} 分钟
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">最近告警</CardTitle>
            <CardDescription>该股票最近 10 次触发</CardDescription>
          </CardHeader>
          <CardContent>
            {sym.alerts.length === 0 ? (
              <p className="text-sm text-muted-foreground">还没有告警记录。</p>
            ) : (
              <div className="divide-y">
                {sym.alerts.map((a) => {
                  let snap: { description?: string } = {};
                  try { snap = JSON.parse(a.snapshot); } catch { /* ignore */ }
                  return (
                    <div key={a.id} className="py-2 text-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-medium truncate">{a.rule.name}</div>
                          <div className="text-xs text-muted-foreground truncate">{snap.description ?? "—"}</div>
                        </div>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(a.triggeredAt).toLocaleString("zh-CN", { hour12: false })}
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
    </div>
  );
}
