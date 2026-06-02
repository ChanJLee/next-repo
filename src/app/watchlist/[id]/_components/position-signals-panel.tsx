"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ArrowDownCircle, ArrowUpCircle } from "lucide-react";
import type { Candle } from "@/lib/data/yahoo";
import { assessPosition, reliabilityOf, type PositionAssessment, type Tone } from "@/lib/signals/position";

const edgePct = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(2)}%`;

const DAYS = 1200; // 需要 MA200 + TD 计数的历史

const TONE_CLS: Record<Tone, string> = {
  pos: "bg-green-100 text-green-700",
  neg: "bg-red-100 text-red-700",
  warn: "bg-amber-100 text-amber-700",
  neutral: "bg-slate-100 text-slate-600",
};

export function PositionSignalsPanel({ symbolId }: { symbolId: number }) {
  const [assess, setAssess] = useState<PositionAssessment | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "short" | "failed">("loading");

  useEffect(() => {
    let aborted = false;
    setState("loading");
    fetch(`/api/symbols/${symbolId}/candles?days=${DAYS}`)
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
        const a = assessPosition(candles);
        if (!a) { setState("short"); return; }
        setAssess(a);
        setState("ready");
      })
      .catch(() => { if (!aborted) setState("failed"); });
    return () => { aborted = true; };
  }, [symbolId]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">持仓状态 / 止盈·买入信号</CardTitle>
          {assess ? <span className="text-xs text-muted-foreground">至 {assess.asOf}</span> : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {state === "loading" ? <p className="text-sm text-muted-foreground">计算中…（本地）</p> : null}
        {state === "short" ? <p className="text-sm text-muted-foreground">历史不足（需 ~1 年以上），先点「回填/复权历史」。</p> : null}
        {state === "failed" ? <p className="text-sm text-red-600">行情获取失败，无法计算。</p> : null}

        {state === "ready" && assess ? (
          <>
            {/* 当前状态提示（最显眼）—— 非买卖指令，旁附历史可靠度 edge */}
            {assess.active.length > 0 ? (
              <div className="space-y-2">
                {assess.active.map((t, i) => {
                  const rel = reliabilityOf(t);
                  return (
                    <div key={i} className={cn("flex items-start gap-2 rounded-md border p-2.5", t.side === "buy" ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50")}>
                      {t.side === "buy" ? <ArrowUpCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-600" /> : <ArrowDownCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold">
                          <span className={t.side === "buy" ? "text-green-700" : "text-amber-700"}>{t.side === "buy" ? "买入倾向" : "止盈倾向"}</span>
                          <span>{t.title}</span>
                          {t.strength === "strong" ? <span className="rounded bg-foreground/10 px-1.5 py-0.5 text-[10px]">强</span> : null}
                          {rel ? (
                            <span className="rounded bg-foreground/5 px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground" title="多样化标的池(34只)走查回测：信号后10日相对基准的平均超额">
                              历史 edge {edgePct(rel.edge10)}/10日 · n={rel.n}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground">{t.reason}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">当前无状态提示，仅看下方状态标注。</p>
            )}

            {/* 当前状态标注 */}
            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
              {assess.states.map((s) => (
                <div key={s.key} className="flex flex-col gap-0.5">
                  <span className="text-[11px] text-muted-foreground">{s.label}</span>
                  <span className={cn("inline-flex w-fit items-center rounded px-2 py-0.5 text-xs font-medium", TONE_CLS[s.tone])}>{s.value}</span>
                </div>
              ))}
            </div>

            {/* 最近触发（窗口内）*/}
            {assess.recent.length > 0 ? (
              <div className="space-y-1 border-t pt-2">
                <div className="text-[11px] text-muted-foreground">最近 60 个交易日触发：</div>
                <div className="flex flex-wrap gap-1.5">
                  {assess.recent.slice(0, 8).map((t, i) => (
                    <span key={i} className={cn("rounded px-1.5 py-0.5 text-[11px]", t.side === "buy" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700")}>
                      {t.date.slice(5)} {t.side === "buy" ? "买入倾向" : "止盈倾向"}·{t.title}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            <p className="text-[11px] leading-relaxed text-muted-foreground">
              这些是<strong>状态提示</strong>，不是买卖指令、也不预测明天涨跌（实测日线方向≈随机）。旁边的
              <strong>历史 edge</strong> 来自 34 只多样化标的（含下跌/震荡/板块ETF，~31 万根）的走查回测——
              止盈倾向后 10 日平均弱于基准 0.1~0.3%、买入倾向后强于基准 0.3~0.7%：<strong>边际小但方向一致</strong>。
              注意：在单边大牛股上趋势会盖过这点边际（edge≈0），别逆势硬用。仅辅助，非投资建议。
            </p>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
