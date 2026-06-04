"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createChart,
  createSeriesMarkers,
  CandlestickSeries,
  HistogramSeries,
  BaselineSeries,
  ColorType,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Time,
} from "lightweight-charts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { RefreshCw } from "lucide-react";
import { CATEGORY_LABEL, STRATEGY_CATEGORY, type StrategyCategory, type StrategyKind } from "@/lib/strategies/types";
import type { Candle as ModelCandle } from "@/lib/data/yahoo";
import { evalStrategies, combinedProbabilitySeries, marketState, alignMarketCloses, type ModelStrategy } from "./market-model";

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
import { computeTDSequential } from "@/lib/indicators/nine-turn";

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
interface NineTurnPoint { time: string; buy13: boolean; sell13: boolean }

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
const MAX_HISTORY_DAYS = 3650;
const LOAD_MORE_DAYS = 365;
// 可视范围左边缘距数据起点不足这么多根时，继续向更早的方向拉 K 线。
const LOAD_MORE_EDGE_BARS = 20;

const UP_COLOR = "#16a34a";
const DOWN_COLOR = "#dc2626";

const LANE_ORDER: StrategyCategory[] = ["trend", "reversion", "pattern"];
const LANE_MARGINS: Record<StrategyCategory, { top: number; bottom: number }> = {
  trend: { top: 0.78, bottom: 0.15 },
  reversion: { top: 0.86, bottom: 0.07 },
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

function pLabel(p: number): { text: string; cls: string } {
  if (p >= 0.6) return { text: "偏多", cls: "text-green-700" };
  if (p <= 0.4) return { text: "偏空", cls: "text-red-700" };
  return { text: "中性", cls: "text-amber-700" };
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
  const [historyDays, setHistoryDays] = useState(RANGE_DAYS["1m"]);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [laneSource, setLaneSource] = useState<{ id: number; name: string; category: StrategyCategory; items: LaneItem[] }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [combined, setCombined] = useState<{ pUp: number; regimeLabel: string } | null>(null);
  const [probSeries, setProbSeries] = useState<{ time: string; value: number }[]>([]);
  const [nineTurn, setNineTurn] = useState<NineTurnPoint[]>([]);
  const [showNine, setShowNine] = useState(true);

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

  const changeRange = useCallback((nextRange: ChartRange) => {
    if (nextRange === range) return;
    setRange(nextRange);
    setHistoryDays(RANGE_DAYS[nextRange]);
    setCandles([]);
    setLaneSource([]);
    setProbSeries([]);
    setNineTurn([]);
    setCombined(null);
  }, [range]);

  const windowDays = RANGE_DAYS[range];
  const canLoadMoreHistory = historyDays < MAX_HISTORY_DAYS;
  const loadMoreHistory = useCallback(() => {
    setHistoryDays((days) => Math.min(days + LOAD_MORE_DAYS, MAX_HISTORY_DAYS));
  }, []);

  useEffect(() => {
    let aborted = false;
    setLoading(true);
    setError(null);
    const days = historyDays;
    const warmup = strategies.reduce((m, s) => Math.max(m, warmupFor(s)), 50);
    // 至少拉 ~800 天，保证「综合多空」的命中率估计稳定（不随所选区间大幅波动）
    const fetchDays = Math.min(Math.max(days + warmup * 2, 800), 3650);
    const force = refreshTick > 0;
    fetch(`/api/symbols/${symbolId}/candles?days=${fetchDays}${force ? "&force=1" : ""}`)
      .then(async (res) => {
        const json = await readJson(res);
        if (aborted) return;
        if (!res.ok) { setError(json.error ?? `HTTP ${res.status}`); setCandles([]); setLaneSource([]); setNineTurn([]); return; }
        const byDay = new Map<string, ModelCandle>();
        for (const c of json.candles ?? []) {
          if (![c.open, c.high, c.low, c.close].every((v: unknown) => typeof v === "number" && Number.isFinite(v))) continue;
          byDay.set(c.time, { date: new Date(`${c.time}T00:00:00Z`), open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume });
        }
        const model = Array.from(byDay.values()).sort((a, b) => a.date.getTime() - b.date.getTime());
        const evals = evalStrategies(model, strategies);
        // 渲染全部已拉取的 K 线；所选窗口只决定图表的初始可视范围，向左滑可看到更早的历史，
        // 滑到数据起点附近时再继续向更早的方向加载。
        const disp = model;
        setCandles(disp.map((c) => ({ time: c.date.toISOString().slice(0, 10), open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume })));
        // TD Sequential：用全量序列计算（Countdown 13 需要长历史才准）
        const td = computeTDSequential(model);
        setNineTurn(disp.map((c, k) => ({ time: c.date.toISOString().slice(0, 10), buy13: td.buy13[k], sell13: td.sell13[k] })));
        setLaneSource(
          evals.map((e) => ({
            id: e.id,
            name: e.name,
            category: e.category,
            items: disp.map((c, k) => ({ time: c.date.toISOString().slice(0, 10), level: e.levels[k] })),
          })),
        );
        // 逐根综合多空概率曲线
        if (evals.length > 0) {
          const st = marketState(model.map((c) => c.close));
          // 跨资产条件：对齐 SPY 到本标的 K 线（拉取失败则 mkt=undefined，退化为基础模型）
          const spyMap = await fetchMarketCloses(fetchDays);
          if (aborted) return;
          const mkt = spyMap ? alignMarketCloses(model, spyMap) : undefined;
          const arr = combinedProbabilitySeries(model, evals, st.weights, 0, model.length, undefined, mkt);
          setProbSeries(disp.map((c, k) => ({ time: c.date.toISOString().slice(0, 10), value: arr[k] })));
          setCombined({ pUp: arr[arr.length - 1] ?? 0.5, regimeLabel: st.label });
        } else {
          setProbSeries([]);
          setCombined(null);
        }
      })
      .catch((e) => { if (!aborted) setError(e instanceof Error ? e.message : "网络错误"); })
      .finally(() => { if (!aborted) setLoading(false); });
    return () => { aborted = true; };
  }, [symbolId, historyDays, refreshTick, strategies]);

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
            <Button key={r.value} variant={range === r.value ? "default" : "outline"} size="sm" onClick={() => changeRange(r.value)}>
              {r.label}
            </Button>
          ))}
          <Button
            variant={showNine ? "default" : "outline"}
            size="sm"
            onClick={() => setShowNine((v) => !v)}
            title="TD Sequential：九转 Setup(9) 后再数 Countdown 到 13，标出罕见的强反转点"
          >
            TD13
          </Button>
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

        <ChartCanvas
          candles={candles}
          lanes={lanes}
          probSeries={probSeries}
          nineTurn={showNine ? nineTurn : []}
          loading={loading}
          error={error}
          resetViewKey={range}
          windowDays={windowDays}
          canLoadMoreHistory={canLoadMoreHistory}
          onLoadMoreHistory={loadMoreHistory}
        />

        {combined ? (
          <div className="mt-2 space-y-1 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground">当前综合多空</span>
              <span className={cn("font-semibold", pLabel(combined.pUp).cls)}>{pLabel(combined.pUp).text} {Math.round(combined.pUp * 100)}%</span>
              <span className="text-muted-foreground">· {combined.regimeLabel}</span>
            </div>
            <div className="text-muted-foreground">
              图下概率曲线：历史拟合 / 模型校准，用来看概率是否和后续走势同向。
            </div>
          </div>
        ) : null}

        {showNine ? (
          <div className="mt-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">TD Sequential</span>：九转 Setup(9) 完成后再数 Countdown 到 13 才标记——<span className="text-green-600">▲TD13（底部）</span>出现在 K 线下方、<span className="text-red-600">▼TD13（顶部）</span>在上方。13 比 9 罕见得多，是更强的潜在反转提示。
          </div>
        ) : null}

        <div className="mt-2 text-xs text-muted-foreground">
          所选区间只决定初始显示范围；向左滑可查看更早的 K 线，滑到起点附近会继续加载，已载入约 {Math.max(1, Math.round(historyDays / 365))} 年历史{canLoadMoreHistory ? "" : "（已到上限）"}。
        </div>

        {lanes.length > 0 ? (
          <div className="mt-2 space-y-1 text-xs text-muted-foreground">
            <div className="flex flex-wrap items-center gap-3">
              {lanes.map((l) => (
                <span key={l.category}>
                  <span className="font-medium text-foreground">{CATEGORY_LABEL[l.category]}</span>：{l.name}
                </span>
              ))}
            </div>
            <div>底部各带 = 所选策略的多空：<span className="text-green-600">绿=多</span> / <span className="text-red-600">红=空</span> / 灰=中性（从上到下依次为上面列出的策略）。绿带对着涨、红带对着跌 = 历史拟合较好。</div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ChartCanvas({
  candles,
  lanes,
  probSeries,
  nineTurn,
  loading,
  error,
  resetViewKey,
  windowDays,
  canLoadMoreHistory,
  onLoadMoreHistory,
}: {
  candles: Candle[];
  lanes: Lane[];
  probSeries: { time: string; value: number }[];
  nineTurn: NineTurnPoint[];
  loading: boolean;
  error: string | null;
  resetViewKey: string;
  windowDays: number;
  canLoadMoreHistory: boolean;
  onLoadMoreHistory: () => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const probSeriesRef = useRef<ISeriesApi<"Baseline"> | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const laneRefs = useRef<Partial<Record<StrategyCategory, ISeriesApi<"Histogram">>>>({});
  const lastCleanRef = useRef<Candle[]>([]);
  const lastResetViewKeyRef = useRef(resetViewKey);
  const clean = useMemo(() => sanitizeCandles(candles), [candles]);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 540,
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
    chart.priceScale("right").applyOptions({ scaleMargins: { top: 0.04, bottom: 0.56 } });
    // 神奇九转的计数数字挂在 K 线上下（markers）
    markersRef.current = createSeriesMarkers(candleSeriesRef.current, []);

    // 逐根综合多空概率（以 0.5 为界，上方绿=偏多、下方红=偏空）
    probSeriesRef.current = chart.addSeries(BaselineSeries, {
      priceScaleId: "prob",
      baseValue: { type: "price", price: 0.5 },
      topLineColor: "rgba(22,163,74,1)", topFillColor1: "rgba(22,163,74,0.28)", topFillColor2: "rgba(22,163,74,0.04)",
      bottomLineColor: "rgba(220,38,38,1)", bottomFillColor1: "rgba(220,38,38,0.04)", bottomFillColor2: "rgba(220,38,38,0.28)",
      lineWidth: 2,
      priceFormat: { type: "custom", formatter: (v: number) => `${(v * 100).toFixed(0)}%`, minMove: 0.01 },
    });
    chart.priceScale("prob").applyOptions({ scaleMargins: { top: 0.46, bottom: 0.36 } });

    volumeSeriesRef.current = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "volume", color: "#94a3b8" });
    chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.66, bottom: 0.24 } });

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
      probSeriesRef.current = null;
      markersRef.current = null;
      laneRefs.current = {};
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const handleVisibleRangeChange = (logicalRange: { from: number; to: number } | null) => {
      if (!logicalRange || loading || !canLoadMoreHistory) return;
      if (logicalRange.from < LOAD_MORE_EDGE_BARS) onLoadMoreHistory();
    };
    chart.timeScale().subscribeVisibleLogicalRangeChange(handleVisibleRangeChange);
    return () => chart.timeScale().unsubscribeVisibleLogicalRangeChange(handleVisibleRangeChange);
  }, [canLoadMoreHistory, loading, onLoadMoreHistory]);

  useEffect(() => {
    if (!probSeriesRef.current) return;
    const m = new Map(probSeries.map((p) => [p.time, p.value]));
    // 与 clean 对齐（缺失的根跳过，避免时间不在序列中）
    probSeriesRef.current.setData(
      clean.filter((c) => m.has(c.time)).map((c) => ({ time: c.time as Time, value: m.get(c.time) as number })),
    );
  }, [clean, probSeries]);

  useEffect(() => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current) return;
    const timeScale = chartRef.current?.timeScale();
    const previous = lastCleanRef.current;
    const visibleRange = timeScale?.getVisibleLogicalRange();
    const resetView = lastResetViewKeyRef.current !== resetViewKey || previous.length === 0;
    const previousFirstTime = previous[0]?.time;
    const prependedBars = !resetView && previousFirstTime ? clean.findIndex((c) => c.time === previousFirstTime) : 0;

    candleSeriesRef.current.setData(clean.map((c) => ({ time: c.time as Time, open: c.open, high: c.high, low: c.low, close: c.close })));
    volumeSeriesRef.current.setData(clean.map((c) => ({ time: c.time as Time, value: c.volume, color: c.close >= c.open ? `${UP_COLOR}55` : `${DOWN_COLOR}55` })));
    if (clean.length > 0) {
      if (resetView) {
        // 切换区间/首次加载：把可视范围对到所选窗口（右端为最新），更早的已拉取历史留在左侧屏幕外，向左滑即可看到。
        const cutoff = new Date(Date.now() - windowDays * 86400_000).toISOString().slice(0, 10);
        const fromIdx = clean.findIndex((c) => c.time >= cutoff);
        timeScale?.setVisibleLogicalRange({ from: (fromIdx < 0 ? 0 : fromIdx) - 0.5, to: clean.length - 0.5 });
      } else if (visibleRange && prependedBars > 0) {
        timeScale?.setVisibleLogicalRange({ from: visibleRange.from + prependedBars, to: visibleRange.to + prependedBars });
      }
    }
    lastCleanRef.current = clean;
    lastResetViewKeyRef.current = resetViewKey;
  }, [clean, resetViewKey, windowDays]);

  useEffect(() => {
    if (!markersRef.current) return;
    const m = new Map(nineTurn.map((p) => [p.time, p]));
    const markers: SeriesMarker<Time>[] = [];
    for (const c of clean) {
      const p = m.get(c.time);
      if (!p) continue;
      if (p.buy13) {
        markers.push({ time: c.time as Time, position: "belowBar", color: UP_COLOR, shape: "arrowUp", text: "TD13", size: 2 });
      } else if (p.sell13) {
        markers.push({ time: c.time as Time, position: "aboveBar", color: DOWN_COLOR, shape: "arrowDown", text: "TD13", size: 2 });
      }
    }
    markersRef.current.setMarkers(markers);
  }, [clean, nineTurn]);

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
      <div ref={containerRef} className="h-[540px] w-full" />
      {loading ? <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">加载中…</div> : null}
      {error ? <div className="absolute inset-0 flex items-center justify-center text-sm text-red-600">{error}</div> : null}
      {!loading && !error && candles.length === 0 ? <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">暂无数据</div> : null}
    </div>
  );
}
