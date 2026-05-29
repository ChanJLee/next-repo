"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  ColorType,
  type IChartApi,
  type ISeriesApi,
  type Time,
} from "lightweight-charts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { RefreshCw } from "lucide-react";
import { CATEGORY_LABEL, STRATEGY_CATEGORY, type StrategyCategory, type StrategyKind } from "@/lib/strategies/types";
import type { Candle as ModelCandle } from "@/lib/data/yahoo";
import { evalStrategies, type ModelStrategy } from "./market-model";

interface Candle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface LaneItem { time: string; level: string }
interface Lane { category: StrategyCategory; name: string; items: LaneItem[] }

type ChartRange = "1w" | "1m" | "3m" | "1y" | "2y" | "5y";
const RANGES: { value: ChartRange; label: string }[] = [
  { value: "1w", label: "1周" },
  { value: "1m", label: "1月" },
  { value: "3m", label: "3月" },
  { value: "1y", label: "1年" },
  { value: "2y", label: "2年" },
  { value: "5y", label: "5年" },
];
const RANGE_DAYS: Record<ChartRange, number> = { "1w": 14, "1m": 35, "3m": 100, "1y": 380, "2y": 760, "5y": 1850 };

const UP_COLOR = "#16a34a";
const DOWN_COLOR = "#dc2626";

const LANE_ORDER: StrategyCategory[] = ["trend", "reversion", "pattern"];
const LANE_MARGINS: Record<StrategyCategory, { top: number; bottom: number }> = {
  trend: { top: 0.74, bottom: 0.18 },
  reversion: { top: 0.84, bottom: 0.08 },
  pattern: { top: 0.94, bottom: 0.0 },
};

function warmupFor(s: ModelStrategy): number {
  try {
    const p = JSON.parse(s.params || "{}");
    return Math.max((p.period ?? 0) + 5, (p.slow ?? 0) + (p.signal ?? 0) + 5, (p.maSlow ?? 0) + 5, 50);
  } catch {
    return 50;
  }
}

function levelColor(level: string | undefined): string {
  if (level === "long") return UP_COLOR;
  if (level === "short") return DOWN_COLOR;
  return "#cbd5e1";
}

function sanitizeCandles(candles: Candle[]): Candle[] {
  const byTime = new Map<string, Candle>();
  for (const c of candles) {
    if (![c.open, c.high, c.low, c.close].every((v) => typeof v === "number" && Number.isFinite(v))) continue;
    byTime.set(c.time, c);
  }
  return Array.from(byTime.values()).sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
}

async function readJson(res: Response): Promise<any> {
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status} 返回非 JSON：${text.replace(/\s+/g, " ").trim().slice(0, 120)}`);
  }
  return res.json();
}

export function SymbolChartPanel({ symbolId, ticker, strategies }: { symbolId: number; ticker: string; strategies: ModelStrategy[] }) {
  const [range, setRange] = useState<ChartRange>("1m");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [laneSource, setLaneSource] = useState<{ id: number; name: string; category: StrategyCategory; items: LaneItem[] }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  const grouped = useMemo(() => {
    const g: Record<StrategyCategory, ModelStrategy[]> = { trend: [], reversion: [], pattern: [] };
    for (const s of strategies) {
      const c = STRATEGY_CATEGORY[s.kind as StrategyKind];
      if (c) g[c].push(s);
    }
    return g;
  }, [strategies]);

  // 每个分类默认选第一条策略
  const [selected, setSelected] = useState<Record<StrategyCategory, number | null>>(() => {
    const pick = (cat: StrategyCategory) => strategies.find((s) => STRATEGY_CATEGORY[s.kind as StrategyKind] === cat)?.id ?? null;
    return { trend: pick("trend"), reversion: pick("reversion"), pattern: pick("pattern") };
  });

  useEffect(() => {
    let aborted = false;
    setLoading(true);
    setError(null);
    const days = RANGE_DAYS[range];
    const warmup = strategies.reduce((m, s) => Math.max(m, warmupFor(s)), 50);
    const fetchDays = Math.min(days + warmup * 2, 3650);
    const force = refreshTick > 0;
    fetch(`/api/symbols/${symbolId}/candles?days=${fetchDays}${force ? "&force=1" : ""}`)
      .then(async (res) => {
        const json = await readJson(res);
        if (aborted) return;
        if (!res.ok) { setError(json.error ?? `HTTP ${res.status}`); setCandles([]); setLaneSource([]); return; }
        const byDay = new Map<string, ModelCandle>();
        for (const c of json.candles ?? []) {
          if (![c.open, c.high, c.low, c.close].every((v: unknown) => typeof v === "number" && Number.isFinite(v))) continue;
          byDay.set(c.time, { date: new Date(`${c.time}T00:00:00Z`), open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume });
        }
        const model = Array.from(byDay.values()).sort((a, b) => a.date.getTime() - b.date.getTime());
        const evals = evalStrategies(model, strategies);
        const sinceTs = Date.now() - days * 86400_000;
        const idx = model.findIndex((c) => c.date.getTime() >= sinceTs);
        const start = idx < 0 ? 0 : idx;
        const disp = model.slice(start);
        setCandles(disp.map((c) => ({ time: c.date.toISOString().slice(0, 10), open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume })));
        setLaneSource(
          evals.map((e) => ({
            id: e.id,
            name: e.name,
            category: e.category,
            items: disp.map((c, k) => ({ time: c.date.toISOString().slice(0, 10), level: e.levels[start + k] })),
          })),
        );
      })
      .catch((e) => { if (!aborted) setError(e instanceof Error ? e.message : "网络错误"); })
      .finally(() => { if (!aborted) setLoading(false); });
    return () => { aborted = true; };
  }, [symbolId, range, refreshTick, strategies]);

  const lanes: Lane[] = useMemo(() => {
    const out: Lane[] = [];
    for (const cat of LANE_ORDER) {
      const id = selected[cat];
      if (id == null) continue;
      const src = laneSource.find((s) => s.id === id);
      if (src) out.push({ category: cat, name: src.name, items: src.items });
    }
    return out;
  }, [selected, laneSource]);

  const latest = candles.at(-1);
  const prev = candles.at(-2);
  const changePct = latest && prev ? ((latest.close - prev.close) / prev.close) * 100 : 0;

  return (
    <Card>
      <CardHeader className="flex flex-col items-start gap-3 space-y-0 sm:flex-row sm:justify-between">
        <div>
          <CardTitle className="text-base">{ticker} 价格走势</CardTitle>
          {latest ? (
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-semibold">${latest.close.toFixed(2)}</span>
              <span className={cn("text-sm font-medium", changePct >= 0 ? "text-green-600" : "text-red-600")}>
                {changePct >= 0 ? "+" : ""}{changePct.toFixed(2)}%
              </span>
              <span className="text-xs text-muted-foreground">至 {latest.time}</span>
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {RANGES.map((r) => (
            <Button key={r.value} variant={range === r.value ? "default" : "outline"} size="sm" onClick={() => setRange(r.value)}>
              {r.label}
            </Button>
          ))}
          <Button variant="ghost" size="icon" onClick={() => setRefreshTick((n) => n + 1)} disabled={loading} title="强制刷新（绕过缓存）">
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* 三个分类下拉：各选一条策略，在图底显示其多空 */}
        <div className="mb-2 flex flex-wrap gap-2">
          {LANE_ORDER.map((cat) => {
            const list = grouped[cat];
            if (list.length === 0) return null;
            const val = selected[cat] != null ? String(selected[cat]) : "none";
            return (
              <div key={cat} className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground">{CATEGORY_LABEL[cat]}</span>
                <Select value={val} onValueChange={(v) => setSelected((p) => ({ ...p, [cat]: v === "none" ? null : Number(v) }))}>
                  <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">不显示</SelectItem>
                    {list.map((s) => (<SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            );
          })}
        </div>

        <ChartCanvas candles={candles} lanes={lanes} loading={loading} error={error} />

        {lanes.length > 0 ? (
          <div className="mt-2 space-y-1 text-xs text-muted-foreground">
            <div className="flex flex-wrap items-center gap-3">
              {lanes.map((l) => (
                <span key={l.category}>
                  <span className="font-medium text-foreground">{CATEGORY_LABEL[l.category]}</span>：{l.name}
                </span>
              ))}
            </div>
            <div>底部各带 = 所选策略的多空：<span className="text-green-600">绿=多</span> / <span className="text-red-600">红=空</span> / 灰=中性（从上到下依次为上面列出的策略）。绿带对着涨、红带对着跌 = 拟合好。</div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ChartCanvas({ candles, lanes, loading, error }: { candles: Candle[]; lanes: Lane[]; loading: boolean; error: string | null }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const laneRefs = useRef<Partial<Record<StrategyCategory, ISeriesApi<"Histogram">>>>({});
  const clean = useMemo(() => sanitizeCandles(candles), [candles]);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 460,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#64748b" },
      grid: { vertLines: { color: "#f1f5f9" }, horzLines: { color: "#f1f5f9" } },
      rightPriceScale: { borderColor: "#e2e8f0" },
      timeScale: { borderColor: "#e2e8f0", timeVisible: false },
      crosshair: { mode: 1 },
    });
    chartRef.current = chart;

    candleSeriesRef.current = chart.addSeries(CandlestickSeries, {
      upColor: UP_COLOR, downColor: DOWN_COLOR, borderUpColor: UP_COLOR, borderDownColor: DOWN_COLOR, wickUpColor: UP_COLOR, wickDownColor: DOWN_COLOR,
    });
    chart.priceScale("right").applyOptions({ scaleMargins: { top: 0.05, bottom: 0.45 } });

    volumeSeriesRef.current = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "volume", color: "#94a3b8" });
    chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.58, bottom: 0.30 } });

    for (const cat of LANE_ORDER) {
      const s = chart.addSeries(HistogramSeries, { priceScaleId: `lane_${cat}`, lastValueVisible: false, priceLineVisible: false });
      chart.priceScale(`lane_${cat}`).applyOptions({ scaleMargins: LANE_MARGINS[cat], visible: false });
      laneRefs.current[cat] = s;
    }

    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && chartRef.current) chartRef.current.applyOptions({ width: w });
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      laneRefs.current = {};
    };
  }, []);

  useEffect(() => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current) return;
    candleSeriesRef.current.setData(clean.map((c) => ({ time: c.time as Time, open: c.open, high: c.high, low: c.low, close: c.close })));
    volumeSeriesRef.current.setData(clean.map((c) => ({ time: c.time as Time, value: c.volume, color: c.close >= c.open ? `${UP_COLOR}55` : `${DOWN_COLOR}55` })));
    if (clean.length > 0) chartRef.current?.timeScale().fitContent();
  }, [clean]);

  useEffect(() => {
    for (const cat of LANE_ORDER) {
      const series = laneRefs.current[cat];
      if (!series) continue;
      const lane = lanes.find((l) => l.category === cat);
      if (!lane) { series.setData([]); continue; }
      const m = new Map(lane.items.map((it) => [it.time, it.level]));
      series.setData(clean.map((c) => ({ time: c.time as Time, value: 1, color: levelColor(m.get(c.time)) })));
    }
  }, [clean, lanes]);

  return (
    <div className="relative">
      <div ref={containerRef} className="h-[460px] w-full" />
      {loading ? <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">加载中…</div> : null}
      {error ? <div className="absolute inset-0 flex items-center justify-center text-sm text-red-600">{error}</div> : null}
      {!loading && !error && candles.length === 0 ? <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">暂无数据</div> : null}
    </div>
  );
}
