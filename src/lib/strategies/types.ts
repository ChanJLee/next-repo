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
