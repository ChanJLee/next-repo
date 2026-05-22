import { z } from "zod";

export const RuleTypeEnum = z.enum(["price", "technical", "volume"]);
export type RuleType = z.infer<typeof RuleTypeEnum>;

export const IndicatorEnum = z.enum([
  "price_above",
  "price_below",
  "change_percent_above",
  "change_percent_below",
  "rsi_above",
  "rsi_below",
  "ma_cross_up",
  "ma_cross_down",
  "macd_cross_up",
  "macd_cross_down",
  "bb_break_upper",
  "bb_break_lower",
  "volume_spike",
]);
export type IndicatorKind = z.infer<typeof IndicatorEnum>;

export const RuleParamsSchema = z
  .object({
    threshold: z.number().optional(),
    period: z.number().int().positive().optional(),
    fast: z.number().int().positive().optional(),
    slow: z.number().int().positive().optional(),
    maType: z.enum(["sma", "ema"]).optional(),
    multiplier: z.number().positive().optional(), // volume_spike: volume > avgVolume * multiplier
    window: z.number().int().positive().optional(),
    stdDev: z.number().positive().optional(),
  })
  .strict();
export type RuleParams = z.infer<typeof RuleParamsSchema>;

export const RuleInputSchema = z.object({
  symbolId: z.number().int().positive(),
  name: z.string().min(1).max(60),
  type: RuleTypeEnum,
  indicator: IndicatorEnum,
  params: RuleParamsSchema.default({}),
  cooldownSec: z.number().int().min(60).max(86400).default(3600),
  enabled: z.boolean().default(true),
});
export type RuleInput = z.infer<typeof RuleInputSchema>;
