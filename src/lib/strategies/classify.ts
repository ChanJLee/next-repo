import { RSI, MACD, SMA, EMA, BollingerBands, ROC } from "technicalindicators";
import type { Candle } from "@/lib/data/yahoo";
import type { Level, StrategyKind, StrategyParams } from "./types";

export interface ClassifyResult {
  level: Level;
  values: Record<string, number | undefined>;
  description: string;
}

interface SeriesContext {
  candles: Candle[];
  closes: number[];
  highs: number[];
  lows: number[];
}

function buildContext(candles: Candle[]): SeriesContext {
  return {
    candles,
    closes: candles.map((c) => c.close),
    highs: candles.map((c) => c.high),
    lows: candles.map((c) => c.low),
  };
}

/**
 * 给定一组（按时间正序）K 线，返回每根 K 线对应的策略级别。
 * - 用于详情页画历史级别带
 * - 用于 cron 评估时取末尾一根作为当前级别
 *
 * 计算原则：levels[i] 仅基于 candles[0..i] 的数据，不可看未来。
 */
export function levelSeries(kind: StrategyKind, params: StrategyParams, candles: Candle[]): Level[] {
  const ctx = buildContext(candles);
  switch (kind) {
    case "ma_trend":      return seriesMaTrend(params, ctx);
    case "rsi_extreme":   return seriesRsiExtreme(params, ctx);
    case "macd":          return seriesMacd(params, ctx);
    case "roc_momentum":  return seriesRocMomentum(params, ctx);
    case "donchian":      return seriesDonchian(params, ctx);
    case "bb_reversion":  return seriesBbReversion(params, ctx);
  }
}

export function classify(
  kind: StrategyKind,
  params: StrategyParams,
  candles: Candle[],
  currentPrice?: number,
): ClassifyResult {
  if (candles.length === 0) {
    return { level: "neutral", values: {}, description: "无数据" };
  }
  // 把当前价格临时替换最后一根 close（用于盘中信号），其他字段保持
  const adjusted = currentPrice
    ? [...candles.slice(0, -1), { ...candles[candles.length - 1], close: currentPrice }]
    : candles;
  const series = levelSeries(kind, params, adjusted);
  const level = series[series.length - 1] ?? "neutral";
  const detail = detailFor(kind, params, adjusted, level);
  return { level, ...detail };
}

// ---------- ma_trend ----------
function seriesMaTrend(params: StrategyParams, ctx: SeriesContext): Level[] {
  const period = params.period ?? 200;
  const tol = (params.tolerance ?? 0) / 100;
  const maFn = params.maType === "ema" ? EMA : SMA;
  const ma = maFn.calculate({ values: ctx.closes, period });
  const offset = ctx.closes.length - ma.length;
  return ctx.closes.map((close, i) => {
    if (i < offset) return "neutral";
    const v = ma[i - offset];
    if (close > v * (1 + tol)) return "long";
    if (close < v * (1 - tol)) return "short";
    return "neutral";
  });
}

// ---------- rsi_extreme ----------
function seriesRsiExtreme(params: StrategyParams, ctx: SeriesContext): Level[] {
  const period = params.period ?? 14;
  const longBelow = params.longBelow ?? 30;
  const shortAbove = params.shortAbove ?? 70;
  const vals = RSI.calculate({ values: ctx.closes, period });
  const offset = ctx.closes.length - vals.length;
  return ctx.closes.map((_, i) => {
    if (i < offset) return "neutral";
    const r = vals[i - offset];
    if (r < longBelow) return "long";
    if (r > shortAbove) return "short";
    return "neutral";
  });
}

// ---------- macd ----------
function seriesMacd(params: StrategyParams, ctx: SeriesContext): Level[] {
  const fastPeriod = params.fast ?? 12;
  const slowPeriod = params.slow ?? 26;
  const signalPeriod = params.signal ?? 9;
  const tol = params.histTolerance ?? 0;
  const vals = MACD.calculate({
    values: ctx.closes,
    fastPeriod,
    slowPeriod,
    signalPeriod,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
  });
  const offset = ctx.closes.length - vals.length;
  return ctx.closes.map((_, i) => {
    if (i < offset) return "neutral";
    const v = vals[i - offset];
    const hist = v?.histogram;
    if (hist === undefined) return "neutral";
    if (hist > tol) return "long";
    if (hist < -tol) return "short";
    return "neutral";
  });
}

// ---------- roc_momentum ----------
function seriesRocMomentum(params: StrategyParams, ctx: SeriesContext): Level[] {
  const period = params.period ?? 252;
  const longAbove = params.longAbove ?? 10;
  const shortBelow = params.shortBelow ?? -10;
  const vals = ROC.calculate({ values: ctx.closes, period });
  const offset = ctx.closes.length - vals.length;
  return ctx.closes.map((_, i) => {
    if (i < offset) return "neutral";
    const r = vals[i - offset];
    if (r > longAbove) return "long";
    if (r < shortBelow) return "short";
    return "neutral";
  });
}

// ---------- donchian ----------
function seriesDonchian(params: StrategyParams, ctx: SeriesContext): Level[] {
  const period = params.period ?? 252;
  const levels: Level[] = [];
  for (let i = 0; i < ctx.candles.length; i++) {
    if (i < period) {
      levels.push("neutral");
      continue;
    }
    const windowHighs = ctx.highs.slice(i - period, i); // 不含 i
    const windowLows = ctx.lows.slice(i - period, i);
    const upper = Math.max(...windowHighs);
    const lower = Math.min(...windowLows);
    const close = ctx.closes[i];
    if (close >= upper) levels.push("long");
    else if (close <= lower) levels.push("short");
    else levels.push("neutral");
  }
  return levels;
}

// ---------- bb_reversion ----------
function seriesBbReversion(params: StrategyParams, ctx: SeriesContext): Level[] {
  const period = params.period ?? 20;
  const stdDev = params.stdDev ?? 2;
  const vals = BollingerBands.calculate({ period, stdDev, values: ctx.closes });
  const offset = ctx.closes.length - vals.length;
  return ctx.closes.map((close, i) => {
    if (i < offset) return "neutral";
    const v = vals[i - offset];
    if (close < v.lower) return "long";   // 跌破下轨 = 均值回归买入
    if (close > v.upper) return "short";  // 上穿上轨 = 卖出
    return "neutral";
  });
}

// ---------- 详情描述（用于推送和日志）----------
function detailFor(
  kind: StrategyKind,
  params: StrategyParams,
  adjusted: Candle[],
  level: Level,
): Omit<ClassifyResult, "level"> {
  const ctx = buildContext(adjusted);
  const last = ctx.candles[ctx.candles.length - 1];
  const close = last?.close;
  switch (kind) {
    case "ma_trend": {
      const period = params.period ?? 200;
      const maFn = params.maType === "ema" ? EMA : SMA;
      const ma = maFn.calculate({ values: ctx.closes, period }).at(-1);
      return {
        values: { close, ma, period },
        description: `价格 ${close?.toFixed(2)} vs MA${period} ${ma?.toFixed(2) ?? "n/a"}`,
      };
    }
    case "rsi_extreme": {
      const period = params.period ?? 14;
      const rsi = RSI.calculate({ values: ctx.closes, period }).at(-1);
      return {
        values: { rsi, period, longBelow: params.longBelow ?? 30, shortAbove: params.shortAbove ?? 70 },
        description: `RSI${period} = ${rsi?.toFixed(2) ?? "n/a"}`,
      };
    }
    case "macd": {
      const fastPeriod = params.fast ?? 12;
      const slowPeriod = params.slow ?? 26;
      const signalPeriod = params.signal ?? 9;
      const v = MACD.calculate({ values: ctx.closes, fastPeriod, slowPeriod, signalPeriod, SimpleMAOscillator: false, SimpleMASignal: false }).at(-1);
      return {
        values: { macd: v?.MACD, signal: v?.signal, hist: v?.histogram },
        description: `MACD ${v?.MACD?.toFixed(3) ?? "n/a"} / Signal ${v?.signal?.toFixed(3) ?? "n/a"}`,
      };
    }
    case "roc_momentum": {
      const period = params.period ?? 252;
      const roc = ROC.calculate({ values: ctx.closes, period }).at(-1);
      return {
        values: { roc, period },
        description: `${period} 日 ROC = ${roc?.toFixed(2) ?? "n/a"}%`,
      };
    }
    case "donchian": {
      const period = params.period ?? 252;
      const start = Math.max(0, ctx.candles.length - period - 1);
      const end = ctx.candles.length - 1;
      const upper = Math.max(...ctx.highs.slice(start, end));
      const lower = Math.min(...ctx.lows.slice(start, end));
      return {
        values: { close, upper, lower, period },
        description: `${period} 日通道 [${lower.toFixed(2)}, ${upper.toFixed(2)}]，当前 ${close?.toFixed(2)}`,
      };
    }
    case "bb_reversion": {
      const period = params.period ?? 20;
      const stdDev = params.stdDev ?? 2;
      const v = BollingerBands.calculate({ period, stdDev, values: ctx.closes }).at(-1);
      return {
        values: { close, upper: v?.upper, lower: v?.lower, middle: v?.middle },
        description: `布林带 [${v?.lower?.toFixed(2) ?? "n/a"}, ${v?.upper?.toFixed(2) ?? "n/a"}]，当前 ${close?.toFixed(2)}`,
      };
    }
  }
  return { values: {}, description: `level=${level}` };
}
