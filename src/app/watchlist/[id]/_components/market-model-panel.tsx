"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { CATEGORY_LABEL } from "@/lib/strategies/types";
import type { Candle } from "@/lib/data/yahoo";
import type { FactorRank } from "@/lib/factor";
import { evalStrategies, combinedProbability, marketState, alignMarketCloses, type ModelStrategy, type CombinedRead, type MarketState } from "./market-model";

/** 拉大盘(SPY)收盘做跨资产条件特征；失败返回 null（模型自动退化为基础特征）。 */
async function fetchMarketCloses(days: number): Promise<Map<string, number> | null> {
  try {
    const res = await fetch(`/api/market/candles?ticker=SPY&days=${days}`);
    if (!res.ok) return null;
    const j = await res.json();
    const m = new Map<string, number>();
    for (const p of j.closes ?? []) m.set(p.time, p.close);
    return m.size > 0 ? m : null;
  } catch {
    return null;
  }
}

// 估准确率要长历史，5 年（已回填）
const MODEL_DAYS = 1825;

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

const REGIME_CLS: Record<string, string> = {
  trend: "bg-blue-100 text-blue-700",
  reversion: "bg-purple-100 text-purple-700",
  random: "bg-slate-100 text-slate-600",
};

// valmom 中期相对排名：唯一过样本外验证的"中期方向"类信号（截面相对，非单股择时）。
function factorWord(p: number): { text: string; cls: string } {
  if (p >= 67) return { text: "偏强", cls: "text-green-700" };
  if (p <= 33) return { text: "偏弱", cls: "text-red-700" };
  return { text: "中性", cls: "text-amber-700" };
}

export function MarketModelPanel({
  symbolId,
  strategies,
  factorRank,
  factorAsOf,
  factorUniverse,
}: {
  symbolId: number;
  strategies: ModelStrategy[];
  factorRank: FactorRank | null;
  factorAsOf: string;
  factorUniverse: number;
}) {
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
        // 跨资产条件：对齐 SPY（失败则退化为基础模型）
        const spyMap = await fetchMarketCloses(MODEL_DAYS);
        if (aborted) return;
        const mkt = spyMap ? alignMarketCloses(candles, spyMap) : undefined;
        setRegime(st);
        setRead(combinedProbability(candles, evals, st.weights, undefined, mkt));
        setState("ready");
      })
      .catch(() => { if (!aborted) setState("failed"); });
    return () => { aborted = true; };
  }, [symbolId, strategies]);

  const fw = factorRank ? factorWord(factorRank.percentile) : null;
  const baseRatePct = read ? Math.round(read.pUp * 100) : null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">中期定位 / 趋势环境</CardTitle>
          {fw ? (
            <span className={cn("text-sm font-semibold", fw.cls)}>价值+动量 {factorRank!.percentile} · {fw.text}</span>
          ) : regime ? (
            <span className="text-xs text-muted-foreground">{regime.label}</span>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {state === "loading" ? <p className="text-sm text-muted-foreground">计算中…（本地）</p> : null}
        {state === "empty" ? <p className="text-sm text-muted-foreground">还没有启用的策略。</p> : null}
        {state === "failed" ? <p className="text-sm text-red-600">行情获取失败，无法计算。</p> : null}

        {state === "ready" && read ? (
          <>
            {/* ① 中期相对排名（valmom）—— 唯一过样本外验证的"中期方向"类信号 */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">价值+动量 · 中期相对排名</span>
                {factorRank ? (
                  <span className="text-muted-foreground">B/M {factorRank.bm} · 12-1动量 {(factorRank.mom * 100).toFixed(0)}%</span>
                ) : <span className="text-muted-foreground">不在参考池</span>}
              </div>
              {factorRank ? (
                <>
                  <div className="relative h-3 w-full overflow-hidden rounded bg-gradient-to-r from-red-200 via-amber-100 to-green-200">
                    <div className="absolute top-0 h-3 w-0.5 bg-foreground" style={{ left: `${factorRank.percentile}%` }} />
                  </div>
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>偏弱(贵/弱)</span><span>参考池 {factorUniverse} 只 · asOf {factorAsOf}</span><span>偏强(便宜/强)</span>
                  </div>
                </>
              ) : (
                <p className="text-[11px] text-muted-foreground">该标的不在价值+动量参考池（ETF / 外国发行人 / 无基本面）。</p>
              )}
            </div>

            {/* ② 市场状态（Hurst）：趋势态顺势可续、震荡态追涨易打脸 */}
            {regime ? (
              <div className="flex flex-wrap items-center gap-2 border-t pt-2 text-xs">
                <span className="text-muted-foreground">趋势环境</span>
                <span className={cn("rounded px-2 py-0.5", REGIME_CLS[regime.regime])}>{regime.label}</span>
                {regime.hurst != null ? <span className="text-muted-foreground">Hurst {regime.hurst.toFixed(2)}</span> : null}
                <span className="text-muted-foreground">
                  {regime.regime === "trend" ? "· 趋势态：动量更易延续" : regime.regime === "reversion" ? "· 震荡态：追涨易打脸、回调更易修复" : "· 随机态：无明显惯性"}
                </span>
              </div>
            ) : null}

            {/* ③ 策略结构拆解（仅展示结构，非方向预测） */}
            <div className="space-y-1.5 border-t pt-2">
              <div className="text-[11px] text-muted-foreground">策略结构（各组当前看多/看空，仅结构展示）</div>
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

            {/* ④ 基准上涨率：明确标注为"非方向预测"，不再当多空结论 */}
            <div className="flex items-center justify-between border-t pt-2 text-[11px] text-muted-foreground">
              <span>历史基准上涨率（{baseRatePct}%）</span>
              <span>≈ 无条件涨率，非方向预测</span>
            </div>

            <p className="text-[11px] leading-relaxed text-muted-foreground">
              这块回答<strong>“相对定位 + 趋势环境”</strong>，不预测“这只票要启动一波行情”。多轮走查样本外检验
              （方向概率 / 绝对动量 / 趋势突破 / 盈余漂移，见 <code>docs/factor-research.md</code>）都证实：单股中期
              <strong>方向与择时</strong>在日线数据里不可预测、不优于基准率。唯一站得住的中期信号是上面的
              <strong>价值+动量截面相对排名</strong>（+0.91%/63d，CI 排除 0）——它说“同样要买，谁更有据”，而非保证涨跌。仅辅助判断，非投资建议。
            </p>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
