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

export interface CategoryRead {
  category: StrategyCategory;
  evidence: number; // 组内平均 log-odds（>0 偏多，<0 偏空）
  longN: number; // 当前看多的策略数
  shortN: number; // 当前看空的策略数
  total: number;
}

export interface CombinedRead {
  pUp: number; // 0..1
  logodds: number;
  byCategory: CategoryRead[];
}

export function combinedProbability(evals: StratEval[]): CombinedRead {
  let total = 0;
  const byCategory: CategoryRead[] = [];
  for (const cat of CATS) {
    const members = evals.filter((e) => e.category === cat);
    if (members.length === 0) continue;
    let sum = 0, n = 0, longN = 0, shortN = 0;
    for (const m of members) {
      if (m.current === "long") { sum += logit(clamp(m.accLong)); n++; longN++; }
      else if (m.current === "short") { sum += -logit(clamp(m.accShort)); n++; shortN++; }
    }
    const evidence = n > 0 ? sum / n : 0; // 组内平均（降相关）
    byCategory.push({ category: cat, evidence, longN, shortN, total: members.length });
    total += evidence; // 跨分类相加
  }
  return { pUp: sigmoid(total), logodds: total, byCategory };
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
