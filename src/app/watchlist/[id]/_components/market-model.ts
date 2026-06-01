/**
 * 客户端多空模型（全部在浏览器算，服务端只提供已缓存的 K 线）。
 *
 * 思路：
 *  1. 每条策略本地算 levelSeries，得到当前级别 + 历史方向准确率（信号后 HORIZON 日的命中率，
 *     用 Beta 伪计数收缩，样本少则趋向 0.5、权重自动变小）。
 *  2. 贝叶斯对数几率合并：每条有信号的策略贡献 log(acc/(1-acc)) 证据；
 *     **组内（同分类）取平均降相关**，再**跨分类相加**——避免一堆相关的趋势策略重复计数、过度自信。
 *  3. 输出 P(多) 概率 + 各分类贡献拆解。
 *  同一份 evals 也用于图表的「分类共识带」。
 */
import { levelSeries } from "@/lib/strategies/classify";
import {
  StrategyKindEnum,
  StrategyParamsSchema,
  STRATEGY_CATEGORY,
  type StrategyCategory,
  type Level,
} from "@/lib/strategies/types";
import type { Candle } from "@/lib/data/yahoo";

export interface ModelStrategy {
  id: number;
  name: string;
  kind: string;
  params: string;
}

const ACC_HORIZON = 10; // 评估「信号后未来 N 个交易日方向」
const PSEUDO = 8; // Beta 平滑伪计数：样本不足时把准确率收缩向 0.5
const CATS: StrategyCategory[] = ["trend", "reversion", "pattern"];

export interface StratEval {
  id: number;
  name: string;
  category: StrategyCategory;
  levels: Level[];
  current: Level;
  accLong: number; // 历史「看多后真涨」的命中率（已收缩）
  accShort: number; // 历史「看空后真跌」的命中率（已收缩）
  longN: number;
  shortN: number;
}

export function evalStrategies(candles: Candle[], strategies: ModelStrategy[]): StratEval[] {
  const closes = candles.map((c) => c.close);
  const out: StratEval[] = [];
  for (const s of strategies) {
    const k = StrategyKindEnum.safeParse(s.kind);
    if (!k.success) continue;
    let p;
    try {
      p = StrategyParamsSchema.parse(JSON.parse(s.params || "{}"));
    } catch {
      p = {};
    }
    const levels = levelSeries(k.data, p, candles);
    let lN = 0, lH = 0, sN = 0, sH = 0;
    for (let i = 0; i < levels.length - ACC_HORIZON; i++) {
      const fwd = closes[i + ACC_HORIZON] - closes[i];
      if (levels[i] === "long") { lN++; if (fwd > 0) lH++; }
      else if (levels[i] === "short") { sN++; if (fwd < 0) sH++; }
    }
    out.push({
      id: s.id,
      name: s.name,
      category: STRATEGY_CATEGORY[k.data],
      levels,
      current: levels[levels.length - 1] ?? "neutral",
      accLong: (lH + PSEUDO / 2) / (lN + PSEUDO),
      accShort: (sH + PSEUDO / 2) / (sN + PSEUDO),
      longN: lN,
      shortN: sN,
    });
  }
  return out;
}

const clamp = (p: number) => Math.min(0.99, Math.max(0.01, p));
const logit = (p: number) => Math.log(p / (1 - p));
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
// 证据强度：仅当命中率 > 50% 才在该方向上贡献，否则记 0（不把"历史常错的信号"反向当成相反证据，避免曲线反直觉）。
const edge = (acc: number) => Math.max(0, logit(clamp(acc)));

/**
 * Hurst 指数（R/S 重标极差法，基于近窗口的对数收益）：
 *   H>0.5 趋势性（有惯性）、H≈0.5 随机游走、H<0.5 均值回归（反持续）。
 * 用它判断当前是"趋势态/震荡态/随机态"，从而动态调整各分类策略的权重。
 */
export function hurstExponent(closes: number[]): number | null {
  const WINDOW = 256;
  if (closes.length < 80) return null;
  const tail = closes.slice(-WINDOW);
  const r: number[] = [];
  for (let i = 1; i < tail.length; i++) {
    if (tail[i] > 0 && tail[i - 1] > 0) r.push(Math.log(tail[i] / tail[i - 1]));
  }
  const n = r.length;
  if (n < 64) return null;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let size = 8; size <= Math.floor(n / 2); size *= 2) {
    const chunks = Math.floor(n / size);
    let rsSum = 0;
    let cnt = 0;
    for (let c = 0; c < chunks; c++) {
      const chunk = r.slice(c * size, (c + 1) * size);
      const mean = chunk.reduce((a, b) => a + b, 0) / size;
      let cum = 0, min = Infinity, max = -Infinity, sq = 0;
      for (const v of chunk) {
        cum += v - mean;
        if (cum < min) min = cum;
        if (cum > max) max = cum;
        sq += (v - mean) ** 2;
      }
      const R = max - min;
      const S = Math.sqrt(sq / size);
      if (S > 0 && R > 0) { rsSum += R / S; cnt++; }
    }
    if (cnt > 0) { xs.push(Math.log(size)); ys.push(Math.log(rsSum / cnt)); }
  }
  if (xs.length < 3) return null;
  const m = xs.length;
  const sx = xs.reduce((a, b) => a + b, 0);
  const sy = ys.reduce((a, b) => a + b, 0);
  const sxx = xs.reduce((a, b) => a + b * b, 0);
  let sxy = 0;
  for (let i = 0; i < m; i++) sxy += xs[i] * ys[i];
  const denom = m * sxx - sx * sx;
  if (denom === 0) return null;
  return (m * sxy - sx * sy) / denom;
}

export type MarketRegime = "trend" | "reversion" | "random";

export interface MarketState {
  hurst: number | null;
  regime: MarketRegime;
  label: string;
  weights: Record<StrategyCategory, number>;
}

/** 由 Hurst 判定市场状态，并给出各分类的动态权重。 */
export function marketState(closes: number[]): MarketState {
  const h = hurstExponent(closes);
  if (h == null) return { hurst: null, regime: "random", label: "数据不足", weights: { trend: 1, reversion: 1, pattern: 1 } };
  if (h >= 0.55) return { hurst: h, regime: "trend", label: "趋势态", weights: { trend: 1.4, reversion: 0.6, pattern: 1 } };
  if (h <= 0.45) return { hurst: h, regime: "reversion", label: "均值回归 / 震荡态", weights: { trend: 0.6, reversion: 1.4, pattern: 1 } };
  return { hurst: h, regime: "random", label: "随机态", weights: { trend: 0.8, reversion: 0.8, pattern: 0.8 } };
}

export interface CategoryRead {
  category: StrategyCategory;
  evidence: number; // 组内平均 log-odds（>0 偏多，<0 偏空）
  weight: number; // 该分类的动态权重（由市场状态决定）
  longN: number; // 当前看多的策略数
  shortN: number; // 当前看空的策略数
  total: number;
}

export interface CombinedRead {
  pUp: number; // 0..1
  logodds: number;
  byCategory: CategoryRead[];
}

export function combinedProbability(
  evals: StratEval[],
  weights: Record<StrategyCategory, number> = { trend: 1, reversion: 1, pattern: 1 },
): CombinedRead {
  let total = 0;
  const byCategory: CategoryRead[] = [];
  for (const cat of CATS) {
    const members = evals.filter((e) => e.category === cat);
    if (members.length === 0) continue;
    let sum = 0, n = 0, longN = 0, shortN = 0;
    for (const m of members) {
      if (m.current === "long") { sum += edge(m.accLong); n++; longN++; }
      else if (m.current === "short") { sum += -edge(m.accShort); n++; shortN++; }
    }
    const evidence = n > 0 ? sum / n : 0; // 组内平均（降相关）
    const w = weights[cat] ?? 1;
    byCategory.push({ category: cat, evidence, weight: w, longN, shortN, total: members.length });
    total += w * evidence; // 按市场状态加权后跨分类相加
  }
  return { pUp: sigmoid(total), logodds: total, byCategory };
}

/**
 * 逐根 K 线的综合多空概率序列：用每根当时各策略的级别 + 历史命中率权重 + 分类权重，
 * 算出该根的 P(多)。用于在图上画概率曲线。
 * 注：命中率是全历史估计（含该根之后的数据），属于"事后视角"的展示，非严格无未来函数的回测。
 */
export function combinedProbabilitySeries(
  evals: StratEval[],
  weights: Record<StrategyCategory, number>,
  fromIdx: number,
  toIdx: number,
): number[] {
  const byCat = CATS.map((cat) => ({ cat, members: evals.filter((e) => e.category === cat) })).filter((g) => g.members.length > 0);
  const out: number[] = [];
  for (let i = fromIdx; i < toIdx; i++) {
    let total = 0;
    for (const { cat, members } of byCat) {
      let sum = 0, n = 0;
      for (const m of members) {
        const lv = m.levels[i];
        if (lv === "long") { sum += edge(m.accLong); n++; }
        else if (lv === "short") { sum += -edge(m.accShort); n++; }
      }
      if (n > 0) total += (weights[cat] ?? 1) * (sum / n);
    }
    out.push(sigmoid(total));
  }
  return out;
}

export interface LaneItem { time: string; long: number; short: number }
export interface CategoryLane { category: StrategyCategory; count: number; items: LaneItem[] }

/** 分类共识带：从 startIdx 起，每个分类每根 K 线的看多/看空策略数。 */
export function categoryLanes(candles: Candle[], evals: StratEval[], startIdx: number): CategoryLane[] {
  const lanes: CategoryLane[] = [];
  for (const cat of CATS) {
    const members = evals.filter((e) => e.category === cat);
    if (members.length === 0) continue;
    const items: LaneItem[] = [];
    for (let i = Math.max(0, startIdx); i < candles.length; i++) {
      let long = 0, short = 0;
      for (const m of members) {
        const lv = m.levels[i];
        if (lv === "long") long++;
        else if (lv === "short") short++;
      }
      items.push({ time: candles[i].date.toISOString().slice(0, 10), long, short });
    }
    lanes.push({ category: cat, count: members.length, items });
  }
  return lanes;
}
