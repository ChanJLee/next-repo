import type { Quote, Candle } from "@/lib/data/yahoo";
import { computeIndicators, type IndicatorSnapshot } from "@/lib/indicators";
import type { IndicatorKind, RuleParams } from "./types";

export interface EvaluationContext {
  quote: Quote;
  candles: Candle[];
  snapshot: IndicatorSnapshot;
}

export interface EvaluationResult {
  triggered: boolean;
  description: string;
  values: Record<string, number | string | undefined>;
}

export function buildContext(quote: Quote, candles: Candle[], params: RuleParams): EvaluationContext {
  const snapshot = computeIndicators(candles, {
    rsiPeriod: params.period,
    maFast: params.fast,
    maSlow: params.slow,
    maType: params.maType,
    bbPeriod: params.window,
    bbStdDev: params.stdDev,
    volumeWindow: params.window,
  });
  return { quote, candles, snapshot };
}

export function evaluate(
  indicator: IndicatorKind,
  params: RuleParams,
  ctx: EvaluationContext,
): EvaluationResult {
  const { quote, snapshot } = ctx;

  switch (indicator) {
    case "price_above": {
      const t = params.threshold ?? 0;
      return {
        triggered: quote.price > t,
        description: `价格 ${quote.price.toFixed(2)} > 阈值 ${t}`,
        values: { price: quote.price, threshold: t },
      };
    }
    case "price_below": {
      const t = params.threshold ?? 0;
      return {
        triggered: quote.price < t,
        description: `价格 ${quote.price.toFixed(2)} < 阈值 ${t}`,
        values: { price: quote.price, threshold: t },
      };
    }
    case "change_percent_above": {
      const t = params.threshold ?? 0;
      return {
        triggered: quote.changePercent > t,
        description: `涨幅 ${quote.changePercent.toFixed(2)}% > ${t}%`,
        values: { changePercent: quote.changePercent, threshold: t },
      };
    }
    case "change_percent_below": {
      const t = params.threshold ?? 0;
      return {
        triggered: quote.changePercent < t,
        description: `跌幅 ${quote.changePercent.toFixed(2)}% < ${t}%`,
        values: { changePercent: quote.changePercent, threshold: t },
      };
    }
    case "rsi_above": {
      const t = params.threshold ?? 70;
      const rsi = snapshot.rsi;
      return {
        triggered: rsi !== undefined && rsi > t,
        description: `RSI ${rsi?.toFixed(2) ?? "n/a"} > ${t}`,
        values: { rsi, threshold: t },
      };
    }
    case "rsi_below": {
      const t = params.threshold ?? 30;
      const rsi = snapshot.rsi;
      return {
        triggered: rsi !== undefined && rsi < t,
        description: `RSI ${rsi?.toFixed(2) ?? "n/a"} < ${t}`,
        values: { rsi, threshold: t },
      };
    }
    case "ma_cross_up": {
      const { maFast, maSlow, maFastPrev, maSlowPrev } = snapshot;
      const triggered =
        maFast !== undefined &&
        maSlow !== undefined &&
        maFastPrev !== undefined &&
        maSlowPrev !== undefined &&
        maFastPrev <= maSlowPrev &&
        maFast > maSlow;
      return {
        triggered,
        description: `MA${params.fast ?? 5} 金叉 MA${params.slow ?? 20}`,
        values: { maFast, maSlow, maFastPrev, maSlowPrev },
      };
    }
    case "ma_cross_down": {
      const { maFast, maSlow, maFastPrev, maSlowPrev } = snapshot;
      const triggered =
        maFast !== undefined &&
        maSlow !== undefined &&
        maFastPrev !== undefined &&
        maSlowPrev !== undefined &&
        maFastPrev >= maSlowPrev &&
        maFast < maSlow;
      return {
        triggered,
        description: `MA${params.fast ?? 5} 死叉 MA${params.slow ?? 20}`,
        values: { maFast, maSlow, maFastPrev, maSlowPrev },
      };
    }
    case "macd_cross_up": {
      const { macd, macdSignal } = snapshot;
      const triggered = macd !== undefined && macdSignal !== undefined && macd > macdSignal && (snapshot.macdHist ?? 0) > 0;
      return {
        triggered,
        description: `MACD 上穿信号线`,
        values: { macd, macdSignal, hist: snapshot.macdHist },
      };
    }
    case "macd_cross_down": {
      const { macd, macdSignal } = snapshot;
      const triggered = macd !== undefined && macdSignal !== undefined && macd < macdSignal && (snapshot.macdHist ?? 0) < 0;
      return {
        triggered,
        description: `MACD 下穿信号线`,
        values: { macd, macdSignal, hist: snapshot.macdHist },
      };
    }
    case "bb_break_upper": {
      return {
        triggered: snapshot.bbUpper !== undefined && quote.price > snapshot.bbUpper,
        description: `价格 ${quote.price.toFixed(2)} 突破布林上轨 ${snapshot.bbUpper?.toFixed(2) ?? "n/a"}`,
        values: { price: quote.price, upper: snapshot.bbUpper },
      };
    }
    case "bb_break_lower": {
      return {
        triggered: snapshot.bbLower !== undefined && quote.price < snapshot.bbLower,
        description: `价格 ${quote.price.toFixed(2)} 跌破布林下轨 ${snapshot.bbLower?.toFixed(2) ?? "n/a"}`,
        values: { price: quote.price, lower: snapshot.bbLower },
      };
    }
    case "volume_spike": {
      const mul = params.multiplier ?? 2;
      const avg = snapshot.avgVolume;
      const triggered = avg !== undefined && avg > 0 && quote.volume > avg * mul;
      return {
        triggered,
        description: `成交量 ${quote.volume.toLocaleString()} > ${mul}× 均值 ${avg ? Math.round(avg).toLocaleString() : "n/a"}`,
        values: { volume: quote.volume, avgVolume: avg, multiplier: mul },
      };
    }
    default: {
      const _exhaustive: never = indicator;
      return { triggered: false, description: `unknown indicator: ${_exhaustive}`, values: {} };
    }
  }
}
