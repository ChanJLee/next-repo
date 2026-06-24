"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { refreshMagsAction } from "./mags-refresh.action";
import type { MagsSnapshot } from "@/lib/mags/snapshot";

// 七姐妹「抄作业卡」：MAGS 等权成分 + 等权目标权重 + 下次季度再平衡日 + 实时行情。
// 信息参考，非买卖建议。抄 MAGS = 押注巨头科技继续领跑的 beta（涨赢大盘、跌也更狠），
// 不是 alpha；零成本 DIY 复制可省其 0.29% 费率。再平衡只为控波动，节奏宜慢（季度即可）。
function fmtET(iso: string, withTime = false): string {
  return new Date(iso).toLocaleString("zh-CN", {
    timeZone: "America/New_York",
    year: withTime ? undefined : "numeric",
    month: "numeric",
    day: "numeric",
    hour: withTime ? "2-digit" : undefined,
    minute: withTime ? "2-digit" : undefined,
    hour12: false,
  });
}

export function MagsCard({ initial }: { initial: MagsSnapshot }) {
  const [snap, setSnap] = useState(initial);
  const [loading, setLoading] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const fresh = await refreshMagsAction();
      setSnap(fresh);
      toast[fresh.quotesOk ? "success" : "warning"](fresh.quotesOk ? "已刷新 MAGS 行情" : "已刷新，但行情获取失败");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "刷新失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">七姐妹抄作业卡（MAGS 等权）</CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">更新于 {fmtET(snap.generatedAt, true)}（美东）</span>
            <Button onClick={refresh} disabled={loading} variant="outline" size="sm">
              {loading ? "刷新中…" : "刷新"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          复制 MAGS：<span className="font-medium">等权持有这 7 只，每季再平衡</span>。目标权重各{" "}
          <span className="font-medium">{snap.targetWeightPct.toFixed(1)}%</span>。信息参考，非买卖建议——这是押注巨头科技继续领跑的
          beta（涨赢大盘、跌也更狠），不是 alpha。
        </p>

        <div className="rounded-md border divide-y">
          {snap.holdings.map((h) => (
            <div key={h.ticker} className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="flex items-baseline gap-2 min-w-0">
                <span className="font-medium text-sm">{h.ticker}</span>
                <span className="truncate text-xs text-muted-foreground">{h.name}</span>
              </div>
              <div className="flex items-center gap-3 shrink-0 text-right">
                <span className="text-xs text-muted-foreground">目标 {snap.targetWeightPct.toFixed(1)}%</span>
                <span className="w-20 text-sm">{h.price != null ? `$${h.price.toFixed(2)}` : "—"}</span>
                <span className={`w-16 text-xs font-medium ${h.changePercent == null ? "text-muted-foreground" : h.changePercent >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {h.changePercent != null ? `${h.changePercent >= 0 ? "+" : ""}${h.changePercent.toFixed(2)}%` : "无报价"}
                </span>
              </div>
            </div>
          ))}
        </div>

        {!snap.quotesOk ? <p className="text-xs text-red-600">行情获取失败，仅展示成分与目标权重；可点【刷新】重试。</p> : null}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
          <span>
            下次季度再平衡 <span className="font-semibold text-foreground">{snap.daysToRebalance}</span> 天后 ·{" "}
            {fmtET(snap.nextRebalanceISO)}
          </span>
          <span>再平衡日把 7 只拍回等权即可；节奏宜慢，零成本也别勤调。</span>
        </div>
        <p className="text-[11px] text-muted-foreground">
          季度末为标准节奏，确切生效日以 Roundhill 公告为准。零成本下 DIY 复制可省 MAGS 的 0.29% 年费。
        </p>
      </CardContent>
    </Card>
  );
}
