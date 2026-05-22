"use client";

import { useEffect, useRef, useState } from "react";
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
import { cn } from "@/lib/utils";

interface Candle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const RANGES: { value: "1w" | "1m" | "3m" | "1y"; label: string }[] = [
  { value: "1w", label: "1周" },
  { value: "1m", label: "1月" },
  { value: "3m", label: "3月" },
  { value: "1y", label: "1年" },
];

// 美股惯例：绿涨红跌
const UP_COLOR = "#16a34a";
const DOWN_COLOR = "#dc2626";

export function SymbolChartPanel({ symbolId, ticker }: { symbolId: number; ticker: string }) {
  const [range, setRange] = useState<"1w" | "1m" | "3m" | "1y">("1m");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let aborted = false;
    setLoading(true);
    setError(null);
    fetch(`/api/symbols/${symbolId}/candles?range=${range}`)
      .then(async (res) => {
        const json = await res.json();
        if (aborted) return;
        if (!res.ok) {
          setError(json.error ?? "拉取失败");
          setCandles([]);
        } else {
          setCandles(json.candles ?? []);
        }
      })
      .catch((e) => {
        if (!aborted) setError(e instanceof Error ? e.message : "网络错误");
      })
      .finally(() => {
        if (!aborted) setLoading(false);
      });
    return () => { aborted = true; };
  }, [symbolId, range]);

  const latest = candles.at(-1);
  const prev = candles.at(-2);
  const changePct = latest && prev ? ((latest.close - prev.close) / prev.close) * 100 : 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
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
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <Button
              key={r.value}
              variant={range === r.value ? "default" : "outline"}
              size="sm"
              onClick={() => setRange(r.value)}
            >
              {r.label}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <ChartCanvas candles={candles} loading={loading} error={error} />
      </CardContent>
    </Card>
  );
}

function ChartCanvas({ candles, loading, error }: { candles: Candle[]; loading: boolean; error: string | null }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 400,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#64748b",
      },
      grid: {
        vertLines: { color: "#f1f5f9" },
        horzLines: { color: "#f1f5f9" },
      },
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

    volumeSeriesRef.current = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
      color: "#94a3b8",
    });
    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

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
    };
  }, []);

  useEffect(() => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current) return;
    candleSeriesRef.current.setData(
      candles.map((c) => ({
        time: c.time as Time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })),
    );
    volumeSeriesRef.current.setData(
      candles.map((c) => ({
        time: c.time as Time,
        value: c.volume,
        color: c.close >= c.open ? `${UP_COLOR}55` : `${DOWN_COLOR}55`,
      })),
    );
    if (candles.length > 0) chartRef.current?.timeScale().fitContent();
  }, [candles]);

  return (
    <div className="relative">
      <div ref={containerRef} className="h-[400px] w-full" />
      {loading ? (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          加载中…
        </div>
      ) : null}
      {error ? (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-red-600">
          {error}
        </div>
      ) : null}
      {!loading && !error && candles.length === 0 ? (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          暂无数据
        </div>
      ) : null}
    </div>
  );
}
