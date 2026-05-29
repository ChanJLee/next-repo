"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  createChart,
  createSeriesMarkers,
  CandlestickSeries,
  HistogramSeries,
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
import { LEVEL_COLOR } from "@/lib/strategies/types";

interface Candle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface LevelPoint {
  time: string;
  level: string;
}

interface StrategyOption {
  id: number;
  name: string;
  kind: string;
}

type ChartRange = "1w" | "1m" | "3m" | "1y" | "2y" | "5y";
const RANGES: { value: ChartRange; label: string }[] = [
  { value: "1w", label: "1周" },
  { value: "1m", label: "1月" },
  { value: "3m", label: "3月" },
  { value: "1y", label: "1年" },
  { value: "2y", label: "2年" },
  { value: "5y", label: "5年" },
];

const UP_COLOR = "#16a34a";
const DOWN_COLOR = "#dc2626";

/**
 * 清洗 K 线给 lightweight-charts 用：丢掉 OHLC 非有限数的根，按交易日去重（保留最后一条），
 * 并按时间升序。lightweight-charts 要求时间唯一且严格升序，否则渲染时报 "Value is null"。
 */
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
    const snippet = text.replace(/\s+/g, " ").trim().slice(0, 120);
    throw new Error(`HTTP ${res.status} 返回非 JSON：${snippet}`);
  }
  return res.json();
}

export function SymbolChartPanel({ symbolId, ticker, strategies }: { symbolId: number; ticker: string; strategies: StrategyOption[] }) {
  const [range, setRange] = useState<ChartRange>("1m");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [selectedStrategyId, setSelectedStrategyId] = useState<string>(strategies[0]?.id?.toString() ?? "");
  const [levels, setLevels] = useState<LevelPoint[]>([]);

  useEffect(() => {
    let aborted = false;
    setLoading(true);
    setError(null);
    const force = refreshTick > 0;
    fetch(`/api/symbols/${symbolId}/candles?range=${range}${force ? "&force=1" : ""}`)
      .then(async (res) => {
        const json = await readJson(res);
        if (aborted) return;
        if (!res.ok) { setError(json.error ?? `HTTP ${res.status}`); setCandles([]); }
        else setCandles(json.candles ?? []);
      })
      .catch((e) => { if (!aborted) setError(e instanceof Error ? e.message : "网络错误"); })
      .finally(() => { if (!aborted) setLoading(false); });
    return () => { aborted = true; };
  }, [symbolId, range, refreshTick]);

  useEffect(() => {
    if (!selectedStrategyId) { setLevels([]); return; }
    let aborted = false;
    fetch(`/api/strategies/${selectedStrategyId}/levels?range=${range}`)
      .then(async (res) => {
        const json = await readJson(res);
        if (aborted) return;
        if (!res.ok) setLevels([]);
        else setLevels(json.items ?? []);
      })
      .catch(() => { if (!aborted) setLevels([]); });
    return () => { aborted = true; };
  }, [selectedStrategyId, range]);

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
          {strategies.length > 0 ? (
            <Select value={selectedStrategyId} onValueChange={setSelectedStrategyId}>
              <SelectTrigger className="w-44 h-8 text-xs"><SelectValue placeholder="策略级别带" /></SelectTrigger>
              <SelectContent>
                {strategies.map((s) => (<SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>))}
              </SelectContent>
            </Select>
          ) : null}
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
        <ChartCanvas candles={candles} levels={levels} loading={loading} error={error} />
        {selectedStrategyId && levels.length > 0 ? (
          <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><span className="inline-block h-3 w-3 rounded" style={{ background: LEVEL_COLOR.long }} /> 多</span>
            <span className="inline-flex items-center gap-1"><span className="inline-block h-3 w-3 rounded" style={{ background: LEVEL_COLOR.neutral }} /> 中</span>
            <span className="inline-flex items-center gap-1"><span className="inline-block h-3 w-3 rounded" style={{ background: LEVEL_COLOR.short }} /> 空</span>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ChartCanvas({ candles, levels, loading, error }: { candles: Candle[]; levels: LevelPoint[]; loading: boolean; error: string | null }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const levelSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const clean = useMemo(() => sanitizeCandles(candles), [candles]);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 460,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#64748b",
      },
      grid: { vertLines: { color: "#f1f5f9" }, horzLines: { color: "#f1f5f9" } },
      rightPriceScale: { borderColor: "#e2e8f0" },
      timeScale: { borderColor: "#e2e8f0", timeVisible: false },
      crosshair: { mode: 1 },
    });
    chartRef.current = chart;

    candleSeriesRef.current = chart.addSeries(CandlestickSeries, {
      upColor: UP_COLOR,
      downColor: DOWN_COLOR,
      borderUpColor: UP_COLOR,
      borderDownColor: DOWN_COLOR,
      wickUpColor: UP_COLOR,
      wickDownColor: DOWN_COLOR,
    });
    markersRef.current = createSeriesMarkers(candleSeriesRef.current, []);

    volumeSeriesRef.current = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
      color: "#94a3b8",
    });
    chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.7, bottom: 0.08 } });

    // 策略级别带（占图表底部 5%）
    levelSeriesRef.current = chart.addSeries(HistogramSeries, {
      priceScaleId: "level",
      lastValueVisible: false,
      priceLineVisible: false,
    });
    chart.priceScale("level").applyOptions({ scaleMargins: { top: 0.97, bottom: 0 }, visible: false });

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
      levelSeriesRef.current = null;
      markersRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current) return;
    // clean 已按交易日去重并升序（lightweight-charts 要求时间唯一且严格升序，
    // 且 OHLC 为有限数，否则渲染时抛 "Value is null"）。
    candleSeriesRef.current.setData(
      clean.map((c) => ({ time: c.time as Time, open: c.open, high: c.high, low: c.low, close: c.close })),
    );
    volumeSeriesRef.current.setData(
      clean.map((c) => ({
        time: c.time as Time,
        value: c.volume,
        color: c.close >= c.open ? `${UP_COLOR}55` : `${DOWN_COLOR}55`,
      })),
    );
    if (clean.length > 0) chartRef.current?.timeScale().fitContent();
  }, [clean]);

  useEffect(() => {
    if (!levelSeriesRef.current || !markersRef.current) return;
    if (levels.length === 0) {
      levelSeriesRef.current.setData([]);
      markersRef.current.setMarkers([]);
      return;
    }
    const levelMap = new Map(levels.map((l) => [l.time, l.level]));
    levelSeriesRef.current.setData(
      clean.map((c) => {
        const lv = levelMap.get(c.time);
        const color = lv === "long" ? LEVEL_COLOR.long : lv === "short" ? LEVEL_COLOR.short : LEVEL_COLOR.neutral;
        return { time: c.time as Time, value: 1, color };
      }),
    );
    // 在 level 转向（变成 long 或 short）的当根 K 线上画箭头
    const markers: SeriesMarker<Time>[] = [];
    let prev = "neutral";
    for (const c of clean) {
      const lv = levelMap.get(c.time) ?? "neutral";
      if (lv !== prev) {
        if (lv === "long") {
          markers.push({ time: c.time as Time, position: "belowBar", shape: "arrowUp", color: LEVEL_COLOR.long, text: "多" });
        } else if (lv === "short") {
          markers.push({ time: c.time as Time, position: "aboveBar", shape: "arrowDown", color: LEVEL_COLOR.short, text: "空" });
        }
      }
      prev = lv;
    }
    markersRef.current.setMarkers(markers);
  }, [clean, levels]);

  return (
    <div className="relative">
      <div ref={containerRef} className="h-[460px] w-full" />
      {loading ? (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">加载中…</div>
      ) : null}
      {error ? (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-red-600">{error}</div>
      ) : null}
      {!loading && !error && candles.length === 0 ? (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">暂无数据</div>
      ) : null}
    </div>
  );
}
