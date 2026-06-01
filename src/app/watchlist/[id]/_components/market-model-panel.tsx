"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { CATEGORY_LABEL } from "@/lib/strategies/types";
import type { Candle } from "@/lib/data/yahoo";
import { evalStrategies, combinedProbability, marketState, type ModelStrategy, type CombinedRead, type MarketState } from "./market-model";

// 估准确率要长历史，5 年（已回填）
const MODEL_DAYS = 1825;

function readLabel(p: number): { text: string; cls: string } {
  if (p >= 0.6) return { text: "偏多", cls: "text-green-700" };
  if (p <= 0.4) return { text: "偏空", cls: "text-red-700" };
  return { text: "中性 / 分歧", cls: "text-amber-700" };
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

const REGIME_CLS: Record<string, string> = {
  trend: "bg-blue-100 text-blue-700",
  reversion: "bg-purple-100 text-purple-700",
  random: "bg-slate-100 text-slate-600",
};

export function MarketModelPanel({ symbolId, strategies }: { symbolId: number; strategies: ModelStrategy[] }) {
  const [read, setRead] = useState<CombinedRead | null>(null);
  const [regime, setRegime] = useState<MarketState | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "empty" | "failed">("loading");

  useEffect(() => {
    let aborted = false;
    if (strategies.length === 0) { setState("empty"); return; }
    setState("loading");
    fetch(`/api/symbols/${symbolId}/candles?days=${MODEL_DAYS}`)
      .then(async (res) => {
        const j = await res.json();
        if (aborted) return;
        if (!res.ok) { setState("failed"); return; }
        const byDay = new Map<string, Candle>();
        for (const c of j.candles ?? []) {
          if (![c.open, c.high, c.low, c.close].every((v: unknown) => typeof v === "number" && Number.isFinite(v))) continue;
          byDay.set(c.time, { date: new Date(`${c.time}T00:00:00Z`), open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume });
        }
        const candles = Array.from(byDay.values()).sort((a, b) => a.date.getTime() - b.date.getTime());
        if (candles.length === 0) { setState("failed"); return; }
        const st = marketState(candles.map((c) => c.close));
        const evals = evalStrategies(candles, strategies);
        setRegime(st);
        setRead(combinedProbability(candles, evals, st.weights));
        setState("ready");
      })
      .catch(() => { if (!aborted) setState("failed"); });
    return () => { aborted = true; };
  }, [symbolId, strategies]);

  const pct = read ? Math.round(read.pUp * 100) : null;
  const label = read ? readLabel(read.pUp) : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">综合多空</CardTitle>
          {state === "ready" && label ? (
            <span className={cn("text-sm font-semibold", label.cls)}>{label.text} · {pct}%</span>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {state === "loading" ? <p className="text-sm text-muted-foreground">计算中…（本地）</p> : null}
        {state === "empty" ? <p className="text-sm text-muted-foreground">还没有启用的策略。</p> : null}
        {state === "failed" ? <p className="text-sm text-red-600">行情获取失败，无法计算。</p> : null}

        {state === "ready" && read ? (
          <>
            {/* 市场状态（Hurst） */}
            {regime ? (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-muted-foreground">市场状态</span>
                <span className={cn("rounded px-2 py-0.5", REGIME_CLS[regime.regime])}>{regime.label}</span>
                {regime.hurst != null ? <span className="text-muted-foreground">Hurst {regime.hurst.toFixed(2)}</span> : null}
                <span className="text-muted-foreground">
                  {regime.regime === "trend" ? "· 放大趋势组权重" : regime.regime === "reversion" ? "· 放大均值回归组权重" : "· 整体降权"}
                </span>
              </div>
            ) : null}

            {/* 概率条：左空右多 */}
            <div className="space-y-1">
              <div className="relative h-3 w-full overflow-hidden rounded bg-gradient-to-r from-red-200 via-slate-200 to-green-200">
                <div className="absolute top-0 h-3 w-0.5 bg-foreground" style={{ left: `${pct}%` }} />
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground"><span>偏空</span><span>中性</span><span>偏多</span></div>
            </div>

            {/* 分类拆解 */}
            <div className="space-y-1.5">
              {read.byCategory.map((c) => {
                const weightedEvidence = c.evidence * c.weight;
                const catP = Math.round(sigmoid(weightedEvidence) * 100);
                const lean = weightedEvidence > 0.05 ? "text-green-700" : weightedEvidence < -0.05 ? "text-red-700" : "text-muted-foreground";
                return (
                  <div key={c.category} className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-muted-foreground">
                      {CATEGORY_LABEL[c.category]}（{c.total}）
                      {c.weight !== 1 ? <span className="ml-1 text-[10px]">×{c.weight.toFixed(1)}</span> : null}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="text-muted-foreground">看多 {c.longN} · 看空 {c.shortN}</span>
                      <span className={cn("font-medium", lean)}>{catP}%</span>
                    </span>
                  </div>
                );
              })}
            </div>

            <p className="text-[11px] leading-relaxed text-muted-foreground">
              当前综合多空：当前读数，用最新 K 线、当前策略状态给出一个概率参考。
            </p>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              谦逊概率模型：走查式样本外回测显示，日线技术特征对未来 10 日方向几乎没有稳定边际，强趋势末端甚至轻微反预测。因此 P(多) 以历史无条件上涨率（基准率）为锚，只做小幅偏移、刻意低自信。仅辅助判断，非投资建议。
            </p>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
