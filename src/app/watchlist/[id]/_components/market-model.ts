/**
 * 客户端多空模型（全部在浏览器算，服务端只提供已缓存的 K 线）。
 *
 * 思路：
 *  1. 每条策略本地算 levelSeries，得到当前级别 + 历史方向准确率（只统计真正转多/转空的触发点，
 *     再按策略类别看未来不同窗口的命中率；
 *     用 Beta 伪计数收缩，样本少则趋向 0.5、权重自动变小）。
 *  2. 把策略结构压缩成多空证据分数（组内平均降相关、按 Hurst 加权）——仅用于分类拆解展示。
 *  3. 概率 P(多) 走「谦逊收缩」路线：以历史无条件上涨率（base rate）为锚，
 *     只让样本外验证过的弱信号（短周期 20 日动量）做小幅偏移，并对过度拉伸做反向修正，
 *     最后把偏移限制在基准率附近的窄带内。理由见下方常量注释与 scripts/backtest-model.ts。
 *  同一份 evals 也用于图表的「分类共识带」。
 */
import { levelSeries } from "@/lib/strategies/classify";
import {
  StrategyKindEnum,
  StrategyParamsSchema,
  STRATEGY_CATEGORY,
  type StrategyCategory,
  type Level,
  type StrategyParams,
} from "@/lib/strategies/types";
import type { Candle } from "@/lib/data/yahoo";

export interface ModelStrategy {
  id: number;
  name: string;
  kind: string;
  params: string;
}

// 混沌系统里信号有效期有限：趋势慢、均值回归较快、形态最短。
const CATEGORY_HORIZON: Record<StrategyCategory, number> = {
  trend: 20,
  reversion: 7,
  pattern: 5,
};
const PSEUDO = 8; // Beta 平滑伪计数：样本不足时把准确率收缩向 0.5
export const CALIBRATION_HORIZON = 10; // 概率定义：未来 N 个交易日收盘价更高
// 走查式样本外回测（scripts/backtest-model.ts）结论：在日线单标的上，
// 趋势强度 / 乖离对未来 10 日方向几乎没有稳定边际，且「强趋势 + 高乖离」的
// 极端状态反而轻微反预测（均值回归）。唯一站得住的弱信号是短周期 20 日动量。
// 因此模型刻意「谦逊」：以历史无条件上涨率为锚，只让短动量做小幅偏移，并裁掉
// 会制造反预测极值的相似样本放大。MAX_TILT 限制概率只在基准率附近窄幅波动。
// 走查回测（scripts/backtest-baselines.ts）显示：单纯顺势的 20 日动量跨期不稳定
// （全历史微正、近段窗口转负），但「状态条件化动量」——趋势态(Hurst>0.5)顺动量、
// 震荡态(<0.5)反动量——在 5~10 日窗口是所有信号里最稳的（AUC≈0.55）。
// 即便如此边际仍很弱，所以偏移系数保持小量级、MAX_TILT 收窄，避免虚假自信。
const CATS: StrategyCategory[] = ["trend", "reversion", "pattern"];

// ---- 校准层参数（可被拟合器进化）----------------------------------------
// 概率定义：logit(P多) = logit(baseRate) + clampTilt(Σ_k weights[k]·tanh(feature_k), maxTilt)
// feature 顺序见 FEATURE_NAMES / buildFeature。每个权重就是「该因子的 log-odds 贡献系数」。
// 默认值复现历史「谦逊」模型：只用状态条件化动量(+0.15) 与 20 日乖离的反向修正(-0.04)，
// 其余因子权重为 0；maxTilt 把偏移限制在基准率附近窄带。
// 用 scripts/featurize.ts + scripts/fit-model.ts 走查样本外进化这些权重。
export const FEATURE_NAMES = [
  "evidence", // 0 策略证据（分类加权 log-odds）
  "ret5",     // 1 5 日标准化动量
  "ret20",    // 2 20 日标准化动量
  "ext20",    // 3 距 20 日均线乖离
  "ext60",    // 4 距 60 日均线乖离
  "rsi",      // 5 RSI 偏离 50
  "extension",// 6 乖离幅度（≥0）
  "overheat", // 7 RSI 过热（≥0）
  "regimeMom",// 8 状态条件化动量（趋势态顺势 / 震荡态反向）
] as const;
export const NUM_FEATURES = FEATURE_NAMES.length;

export interface ModelParams {
  weights: number[]; // 与 [...FEATURE_NAMES, ...CROSS_FEATURE_NAMES] 等长，逐因子 log-odds 权重（作用于 tanh(feature)）
  maxTilt: number;   // 相对基准率的最大 |log-odds| 偏移
}

// 由 scripts/fit-model.ts 在复权长历史（9 标的、走查样本外）上差分进化得到。
// 11 维 = 9 基础 + 2 跨资产（mktTrend, volRegime）。跨资产把样本外 Brier-skill 再 +0.0015，
// 主贡献是 volRegime（VIX 代理，负权重：高波动→调低涨概率），跨 seed/λ 符号稳定。
// 末两位作用于 SPY 派生的跨资产特征；线上缺 SPY 时 probabilityFromFeature 的 min(len)
// 会自动只用前 9 维 → 优雅退化为基础模型。
export const DEFAULT_MODEL_PARAMS: ModelParams = {
  weights: [0.0141, -0.0292, 0.0155, -0.0051, 0.0111, 0.0002, 0.0757, 0.0304, -0.0101, 0.0016, -0.0437],
  maxTilt: 0.1211,
};

export interface StratEval {
  id: number;
  name: string;
  category: StrategyCategory;
  levels: Level[];
  current: Level;
  horizon: number;
  accLong: number; // 历史「看多后真涨」的命中率（已收缩）
  accShort: number; // 历史「看空后真跌」的命中率（已收缩）
  longN: number;
  shortN: number;
}

function horizonFor(category: StrategyCategory, params: StrategyParams): number {
  if (category === "pattern" && typeof params.holdBars === "number") {
    return Math.min(10, Math.max(3, params.holdBars));
  }
  return CATEGORY_HORIZON[category];
}

function isSignalStart(levels: Level[], i: number): boolean {
  const current = levels[i];
  if (current === "neutral") return false;
  return i === 0 || levels[i - 1] !== current;
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
    const category = STRATEGY_CATEGORY[k.data];
    const horizon = horizonFor(category, p);
    const levels = levelSeries(k.data, p, candles);
    let lN = 0, lH = 0, sN = 0, sH = 0;
    for (let i = 0; i < levels.length - horizon; i++) {
      if (!isSignalStart(levels, i)) continue;
      const fwd = closes[i + horizon] - closes[i];
      if (levels[i] === "long") { lN++; if (fwd > 0) lH++; }
      else if (levels[i] === "short") { sN++; if (fwd < 0) sH++; }
    }
    out.push({
      id: s.id,
      name: s.name,
      category,
      levels,
      current: levels[levels.length - 1] ?? "neutral",
      horizon,
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
const clampFeature = (v: number) => Math.min(4, Math.max(-4, Number.isFinite(v) ? v : 0));

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

function maAt(closes: number[], i: number, period: number): number | null {
  if (i + 1 < period) return null;
  return mean(closes.slice(i + 1 - period, i + 1));
}

function dailyVolAt(closes: number[], i: number, period: number = 20): number {
  if (i < period) return 0.02;
  const returns: number[] = [];
  for (let j = i + 1 - period; j <= i; j++) {
    const prev = closes[j - 1];
    const cur = closes[j];
    if (prev > 0 && cur > 0) returns.push(Math.log(cur / prev));
  }
  if (returns.length < 2) return 0.02;
  const m = mean(returns);
  const variance = mean(returns.map((r) => (r - m) ** 2));
  return Math.max(0.005, Math.sqrt(variance));
}

function normalizedReturn(closes: number[], i: number, lookback: number, vol: number): number {
  if (i < lookback || closes[i - lookback] <= 0 || closes[i] <= 0) return 0;
  return clampFeature(Math.log(closes[i] / closes[i - lookback]) / (vol * Math.sqrt(lookback)));
}

function normalizedDistanceToMa(closes: number[], i: number, period: number, vol: number): number {
  const ma = maAt(closes, i, period);
  if (!ma || ma <= 0 || closes[i] <= 0) return 0;
  return clampFeature(Math.log(closes[i] / ma) / (vol * Math.sqrt(period / 5)));
}

function rsiFeature(closes: number[], i: number, period: number = 14): number {
  if (i < period) return 0;
  let gain = 0;
  let loss = 0;
  for (let j = i + 1 - period; j <= i; j++) {
    const diff = closes[j] - closes[j - 1];
    if (diff >= 0) gain += diff;
    else loss -= diff;
  }
  if (gain === 0 && loss === 0) return 0;
  const rs = loss === 0 ? 100 : gain / loss;
  const rsi = 100 - 100 / (1 + rs);
  return clampFeature((rsi - 50) / 25);
}

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

function categoryReadsAt(
  evals: StratEval[],
  weights: Record<StrategyCategory, number> = { trend: 1, reversion: 1, pattern: 1 },
  index: number,
): { total: number; byCategory: CategoryRead[] } {
  let total = 0;
  const byCategory: CategoryRead[] = [];
  for (const cat of CATS) {
    const members = evals.filter((e) => e.category === cat);
    if (members.length === 0) continue;
    let sum = 0, n = 0, longN = 0, shortN = 0;
    for (const m of members) {
      const level = m.levels[index] ?? "neutral";
      if (level === "long") { sum += edge(m.accLong); n++; longN++; }
      else if (level === "short") { sum += -edge(m.accShort); n++; shortN++; }
    }
    const evidence = n > 0 ? sum / n : 0; // 组内平均（降相关）
    const w = weights[cat] ?? 1;
    byCategory.push({ category: cat, evidence, weight: w, longN, shortN, total: members.length });
    total += w * evidence; // 按市场状态加权后跨分类相加
  }
  return { total, byCategory };
}

// ---- 跨资产条件特征（生产）-------------------------------------------------
// 单标的日线方向的多数方差来自大盘 beta + 波动率 regime。引入大盘(SPY)做「条件」。
// 走查实验里只有这两维跨 seed/λ 符号稳定、样本外为正，其余（mktMom/相对强弱/动量×平静度）
// 是噪声，已砍掉：
//   · mktTrend  大盘 vs 200d MA（风险偏好 on/off；权重为正）
//   · volRegime 20d/252d 已实现波动率之比的对数（VIX 代理，>0=紧张；权重为负）
// mkt 为对齐到 candles 同 index 的 SPY 收盘序列；不传或当根无大盘数据 → 全 0
// （probabilityFromFeature 用 min(len) 对齐，缺 SPY 时自动退化为基础 9 维模型）。
export interface CrossAssetContext {
  mkt: number[]; // 与 candles 等长、按 index 对齐的大盘（SPY）收盘价；缺失处前向填充，更早处置 0
}
export const CROSS_FEATURE_NAMES = ["mktTrend", "volRegime"] as const;
export const NUM_CROSS_FEATURES = CROSS_FEATURE_NAMES.length;

function crossFeatures(closes: number[], mkt: number[], index: number): number[] {
  const zero = new Array(NUM_CROSS_FEATURES).fill(0);
  if (index < 20 || mkt.length !== closes.length || !(mkt[index] > 0)) return zero;
  const mvol = dailyVolAt(mkt, index, 20);
  const mktTrend = normalizedDistanceToMa(mkt, index, 200, mvol);
  // 波动率 regime：20 日 vs 252 日已实现波动率之比的对数（VIX 代理；>0 紧张）
  const rvShort = dailyVolAt(mkt, index, 20);
  const rvLong = dailyVolAt(mkt, index, 252);
  const volRegime = rvLong > 0 ? clampFeature(Math.log(rvShort / rvLong) / 0.5) : 0;
  return [mktTrend, volRegime];
}

/** 把大盘收盘按日期前向填充对齐到目标 K 线序列（live 与离线 featurize 共用，保证口径一致）。 */
export function alignMarketCloses(candles: { date: Date }[], mktByDate: Map<string, number>): number[] {
  const out: number[] = [];
  let last = 0;
  for (const c of candles) {
    const v = mktByDate.get(c.date.toISOString().slice(0, 10));
    if (v != null && v > 0) last = v;
    out.push(last);
  }
  return out;
}

export function buildFeature(
  candles: Candle[],
  evals: StratEval[],
  weights: Record<StrategyCategory, number>,
  index: number,
  evidenceOverride?: number, // 点-时证据（PIT 上下文提供）；缺省则用 evals 的全样本命中率（离线切片调用本就点-时）
  cross?: CrossAssetContext,  // 跨资产上下文；不传 → 仅产出 9 维基础特征（生产路径不变）
): { rawScore: number; feature: number[] | null } {
  const closes = candles.map((c) => c.close);
  if (index < 60) return { rawScore: 0, feature: null };

  const total = evidenceOverride ?? categoryReadsAt(evals, weights, index).total;
  const vol = dailyVolAt(closes, index);
  const feature = [
    clampFeature(total),
    normalizedReturn(closes, index, 5, vol),
    normalizedReturn(closes, index, 20, vol),
    normalizedDistanceToMa(closes, index, 20, vol),
    normalizedDistanceToMa(closes, index, 60, vol),
    rsiFeature(closes, index),
  ];
  const extension = Math.max(Math.abs(feature[3]), Math.abs(feature[4]));
  const overheat = Math.max(0, feature[5]);
  feature.push(clampFeature(extension), clampFeature(overheat));
  // feature[8] = 状态条件化动量：趋势态顺势、震荡态反向（点-时 Hurst，仅用 index 之前的数据）
  const h = hurstExponent(closes.slice(0, index + 1));
  const regimeSign = h == null ? 0 : Math.sign(h - 0.5);
  feature.push(clampFeature(regimeSign * feature[2]));
  // 追加跨资产条件特征（仅当提供上下文）。tiltFromFeatures 用 min(len) 对齐，
  // 故 9 维权重作用于此 14 维特征时自动忽略尾部 → 生产模型零影响。
  if (cross) feature.push(...crossFeatures(closes, cross.mkt, index));
  return { rawScore: total, feature };
}

/**
 * 点-时（walk-forward）上下文：任意 index i 处的证据/基准率只用「截至 i 已实现的历史」。
 *   · 每条策略的命中率：信号起点 j 的结局在 j+horizon 才揭晓，故只在 r=j+horizon ≤ i 时计入；
 *     用前缀和使 readsAt(i) 为 O(策略数)。
 *   · baseRate(i)：标签 j 的结局在 j+H 揭晓，累计 [0, i-H] 的上涨率（与 featurize.ts 同口径）。
 * 这样图表历史曲线不再借用未来命中率/基准率——与离线评估一致、无未来函数。
 */
function buildPITContext(candles: Candle[], evals: StratEval[]) {
  const n = candles.length;
  const closes = candles.map((c) => c.close);

  const stats = evals.map((e) => {
    const longHit = new Array(n).fill(0);
    const longCnt = new Array(n).fill(0);
    const shortHit = new Array(n).fill(0);
    const shortCnt = new Array(n).fill(0);
    for (let j = 0; j < e.levels.length; j++) {
      if (!isSignalStart(e.levels, j)) continue;
      const r = j + e.horizon;
      if (r >= n) continue; // 结局未实现 → 点-时不计入
      const up = closes[r] > closes[j];
      if (e.levels[j] === "long") { longCnt[r] += 1; if (up) longHit[r] += 1; }
      else if (e.levels[j] === "short") { shortCnt[r] += 1; if (!up) shortHit[r] += 1; }
    }
    for (let i = 1; i < n; i++) {
      longHit[i] += longHit[i - 1]; longCnt[i] += longCnt[i - 1];
      shortHit[i] += shortHit[i - 1]; shortCnt[i] += shortCnt[i - 1];
    }
    return { e, longHit, longCnt, shortHit, shortCnt };
  });

  const H = CALIBRATION_HORIZON;
  const upCum = new Array(n).fill(0);
  const totCum = new Array(n).fill(0);
  for (let j = 0; j + H < n; j++) {
    const r = j + H;
    totCum[r] += 1;
    if (closes[r] > closes[j]) upCum[r] += 1;
  }
  for (let i = 1; i < n; i++) { upCum[i] += upCum[i - 1]; totCum[i] += totCum[i - 1]; }

  const accLongAt = (s: (typeof stats)[number], i: number) => (s.longHit[i] + PSEUDO / 2) / (s.longCnt[i] + PSEUDO);
  const accShortAt = (s: (typeof stats)[number], i: number) => (s.shortHit[i] + PSEUDO / 2) / (s.shortCnt[i] + PSEUDO);

  function readsAt(weights: Record<StrategyCategory, number>, index: number): { total: number; byCategory: CategoryRead[] } {
    let total = 0;
    const byCategory: CategoryRead[] = [];
    for (const cat of CATS) {
      const members = stats.filter((s) => s.e.category === cat);
      if (members.length === 0) continue;
      let sum = 0, cnt = 0, longN = 0, shortN = 0;
      for (const s of members) {
        const level = s.e.levels[index] ?? "neutral";
        if (level === "long") { sum += edge(accLongAt(s, index)); cnt++; longN++; }
        else if (level === "short") { sum += -edge(accShortAt(s, index)); cnt++; shortN++; }
      }
      const evidence = cnt > 0 ? sum / cnt : 0;
      const w = weights[cat] ?? 1;
      byCategory.push({ category: cat, evidence, weight: w, longN, shortN, total: members.length });
      total += w * evidence;
    }
    return { total, byCategory };
  }

  // 实现样本 < 30 时基准率估计极不稳定（会出现 0.99/0.01 尖刺），退回 0.5。
  // 仅影响最早 ~30+H 根（离线拟合从第 400 根起，从不评估此区）→ 与 featurize 口径零漂移。
  const baseRateAt = (index: number) => (totCum[index] >= 30 ? upCum[index] / totCum[index] : 0.5);
  return { readsAt, baseRateAt };
}

// 逐因子加权求和 → log-odds 偏移（每个因子先过 tanh 做软饱和）
export function tiltFromFeatures(feature: number[], weights: number[]): number {
  let s = 0;
  const n = Math.min(feature.length, weights.length);
  for (let k = 0; k < n; k++) s += weights[k] * Math.tanh(feature[k] ?? 0);
  return s;
}

/**
 * 把单点特征 + 点-时基准率 + 模型参数映射为 P(多)。
 * 这是校准层的唯一实现：图表、回测、拟合器都走它，保证不漂移。
 */
export function probabilityFromFeature(
  feature: number[] | null,
  baseRate: number,
  params: ModelParams = DEFAULT_MODEL_PARAMS,
): number {
  const anchor = clamp(baseRate); // 没有任何边际时的最佳猜测就是历史上涨率
  if (!feature) return anchor;
  const m = params.maxTilt;
  const tilt = Math.min(m, Math.max(-m, tiltFromFeatures(feature, params.weights)));
  return clamp(sigmoid(logit(anchor) + tilt));
}

export function combinedProbability(
  candles: Candle[],
  evals: StratEval[],
  weights: Record<StrategyCategory, number> = { trend: 1, reversion: 1, pattern: 1 },
  params: ModelParams = DEFAULT_MODEL_PARAMS,
  mkt?: number[], // 对齐到 candles 的大盘(SPY)收盘；提供则启用跨资产条件维，缺省退化为基础特征
): CombinedRead {
  const index = candles.length - 1;
  const cross = mkt ? { mkt } : undefined;
  const ctx = buildPITContext(candles, evals);
  const { total, byCategory } = ctx.readsAt(weights, index);
  const { feature } = buildFeature(candles, evals, weights, index, total, cross);
  const pUp = probabilityFromFeature(feature, ctx.baseRateAt(index), params);
  return { pUp, logodds: total, byCategory };
}

/**
 * 逐根 K 线的综合多空概率序列（点-时、无未来函数）：每根只用截至该根已实现的
 * 命中率与基准率（见 buildPITContext），故图上历史曲线就是当时实时系统会给出的读数。
 */
export function combinedProbabilitySeries(
  candles: Candle[],
  evals: StratEval[],
  weights: Record<StrategyCategory, number>,
  fromIdx: number,
  toIdx: number,
  params: ModelParams = DEFAULT_MODEL_PARAMS,
  mkt?: number[], // 对齐到 candles 的大盘(SPY)收盘
): number[] {
  const cross = mkt ? { mkt } : undefined;
  const ctx = buildPITContext(candles, evals);
  const out: number[] = [];
  for (let i = fromIdx; i < toIdx; i++) {
    const { total } = ctx.readsAt(weights, i);
    const { feature } = buildFeature(candles, evals, weights, i, total, cross);
    out.push(probabilityFromFeature(feature, ctx.baseRateAt(i), params));
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
