"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface BacktestData {
  name: string;
  kind: string;
  ticker: string;
  days: number;
  window: { from: string; to: string } | null;
  initialEquity: number;
  finalEquity: number;
  totalReturn: number;
  buyHoldReturn: number;
  excessReturn: number;
  winRate: number;
  numTrades: number;
  avgTradeReturn: number;
  maxDrawdown: number;
  avgHoldDays: number;
  exposure: number;
  equityCurve: { time: string; equity: number; buyHold: number }[];
}

const RANGES = [
  { value: 180, label: "6 个月" },
  { value: 365, label: "1 年" },
  { value: 730, label: "2 年" },
  { value: 1825, label: "5 年" },
];

export function BacktestInline({ strategyId, ticker: _ticker }: { strategyId: number; ticker: string }) {
  const [days, setDays] = useState(730);
  const [data, setData] = useState<BacktestData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let aborted = false;
    setLoading(true);
    setError(null);
    fetch(`/api/strategies/${strategyId}/backtest?days=${days}`)
      .then(async (res) => {
        const json = await res.json();
        if (aborted) return;
        if (!res.ok) {
          setError(json.error ?? "回测失败");
        } else {
          setData(json);
        }
      })
      .catch((e) => { if (!aborted) setError(e instanceof Error ? e.message : "网络错误"); })
      .finally(() => { if (!aborted) setLoading(false); });
    return () => { aborted = true; };
  }, [strategyId, days]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1">
        {RANGES.map((r) => (
          <Button key={r.value} variant={days === r.value ? "default" : "outline"} size="sm" onClick={() => setDays(r.value)}>
            {r.label}
          </Button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">回测中…</p>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : data ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
            <Metric label="策略收益" value={`${data.totalReturn >= 0 ? "+" : ""}${data.totalReturn.toFixed(2)}%`} highlight={data.totalReturn >= 0 ? "green" : "red"} />
            <Metric label="买入持有" value={`${data.buyHoldReturn >= 0 ? "+" : ""}${data.buyHoldReturn.toFixed(2)}%`} />
            <Metric label="超额收益" value={`${data.excessReturn >= 0 ? "+" : ""}${data.excessReturn.toFixed(2)}%`} highlight={data.excessReturn >= 0 ? "green" : "red"} />
            <Metric label="最大回撤" value={`-${data.maxDrawdown.toFixed(2)}%`} highlight="red" />
            <Metric label="交易次数" value={`${data.numTrades}`} />
            <Metric label="胜率" value={`${data.winRate.toFixed(1)}%`} />
            <Metric label="均持仓天数" value={`${data.avgHoldDays.toFixed(0)} 天`} />
            <Metric label="持仓时间占比" value={`${data.exposure.toFixed(1)}%`} />
          </div>

          <EquitySparkline curve={data.equityCurve} />

          <p className="text-xs text-muted-foreground">
            回测窗口：{data.window ? `${data.window.from} → ${data.window.to}` : "n/a"}
            ；初始资金 ${data.initialEquity.toLocaleString()}，期末 ${Math.round(data.finalEquity).toLocaleString()}
          </p>
        </>
      ) : null}
    </div>
  );
}

function Metric({ label, value, highlight }: { label: string; value: string; highlight?: "green" | "red" }) {
  return (
    <div className="rounded border bg-background px-2 py-1.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("font-semibold", highlight === "green" && "text-green-600", highlight === "red" && "text-red-600")}>{value}</div>
    </div>
  );
}

function EquitySparkline({ curve }: { curve: { time: string; equity: number; buyHold: number }[] }) {
  if (curve.length < 2) return null;
  const W = 600;
  const H = 100;
  const PAD = 4;
  const ys = [...curve.map((c) => c.equity), ...curve.map((c) => c.buyHold)];
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const rangeY = maxY - minY || 1;
  const xStep = (W - PAD * 2) / (curve.length - 1);
  const norm = (v: number) => H - PAD - ((v - minY) / rangeY) * (H - PAD * 2);
  const path = (key: "equity" | "buyHold") =>
    curve.map((c, i) => `${i === 0 ? "M" : "L"}${(PAD + i * xStep).toFixed(2)},${norm(c[key]).toFixed(2)}`).join(" ");
  return (
    <div className="rounded border bg-background p-2">
      <div className="flex items-center gap-3 text-xs mb-1">
        <span className="inline-flex items-center gap-1"><span className="inline-block h-0.5 w-3 bg-blue-500" /> 策略</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block h-0.5 w-3 bg-slate-400" /> 买入持有</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-24">
        <path d={path("buyHold")} fill="none" stroke="#94a3b8" strokeWidth="1.2" />
        <path d={path("equity")} fill="none" stroke="#2563eb" strokeWidth="1.6" />
      </svg>
    </div>
  );
}
