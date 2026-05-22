import { z } from "zod";

export const LEVELS = ["long", "neutral", "short"] as const;
export type Level = (typeof LEVELS)[number];

export const LEVEL_LABEL: Record<Level, string> = {
  long: "多",
  neutral: "中",
  short: "空",
};

export const LEVEL_COLOR: Record<Level, string> = {
  long: "#16a34a",      // 绿
  neutral: "#94a3b8",   // 灰
  short: "#dc2626",     // 红
};

export const StrategyKindEnum = z.enum([
  "ma_trend",       // 价格 vs MA(period)：上方=多，下方=空，附近 tolerance% 视为中
  "rsi_extreme",    // RSI 极值：超卖=多（加仓机会），超买=空
  "macd",           // MACD 信号线穿越：MACD > Signal = 多
  "roc_momentum",   // N 日动量：上下阈值划分三态
  "donchian",       // Donchian channel：突破上轨=多，下轨=空
  "bb_reversion",   // 布林带均值回归：跌破下轨=多（买入机会），上穿上轨=空
  "candle_pattern", // 经典蜡烛图反转形态：锤子/吞没/晨星等触发后短期 long，射击之星/暮星等触发后 short
  "selling_climax", // 卖出高潮（VSA / Wyckoff）：下跌趋势中放量长下影+累计跌幅，触发后短期 long
  "buying_climax",  // 买入高潮：上涨趋势中放量长上影+累计涨幅，触发后短期 short（仅告警，long-only 回测不入场）
]);
export type StrategyKind = z.infer<typeof StrategyKindEnum>;

export const StrategyParamsSchema = z
  .object({
    period: z.number().int().positive().optional(),
    tolerance: z.number().min(0).max(50).optional(),
    maType: z.enum(["sma", "ema"]).optional(),
    longBelow: z.number().optional(),
    shortAbove: z.number().optional(),
    longAbove: z.number().optional(),
    shortBelow: z.number().optional(),
    fast: z.number().int().positive().optional(),
    slow: z.number().int().positive().optional(),
    signal: z.number().int().positive().optional(),
    histTolerance: z.number().min(0).optional(),
    stdDev: z.number().positive().optional(),
    holdBars: z.number().int().min(1).max(60).optional(),
    trendPeriod: z.number().int().min(0).max(500).optional(),
    volumeMultiple: z.number().positive().optional(),
    tailRatio: z.number().min(0).max(1).optional(),
    drawdownPct: z.number().max(0).optional(),
    gainPct: z.number().min(0).optional(),
    lookback: z.number().int().positive().max(250).optional(),
    requireConfirmation: z.boolean().optional(),
  })
  .strict();
export type StrategyParams = z.infer<typeof StrategyParamsSchema>;

export const StrategyInputSchema = z.object({
  symbolId: z.number().int().positive(),
  name: z.string().min(1).max(60),
  kind: StrategyKindEnum,
  params: StrategyParamsSchema.default({}),
  cooldownSec: z.number().int().min(60).max(86400).default(3600),
  enabled: z.boolean().default(true),
});
export type StrategyInput = z.infer<typeof StrategyInputSchema>;

/**
 * 推送是否需要触发：从 prev 到 next 是否构成「转多」或「转空」信号。
 * 中性 ↔ 任意 不推；多 ↔ 空 一定推。
 */
export function isSignalTransition(prev: Level, next: Level): boolean {
  if (prev === next) return false;
  return next === "long" || next === "short";
}
