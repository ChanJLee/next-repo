/**
 * 拟合/评估共用：特征缓存读写、时间切分、概率打分指标。
 * 打分一律走 market-model 的 probabilityFromFeature，保证与线上模型零漂移。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  probabilityFromFeature,
  DEFAULT_MODEL_PARAMS,
  type ModelParams,
} from "../src/app/watchlist/[id]/_components/market-model";

export interface FeatureRow {
  sym: string;
  idx: number;
  date: string;
  f: number[];
  y: number;
  base: number;
}

export interface FeatureCache {
  createdAt: string;
  horizon: number;
  numFeatures: number;
  featureNames?: string[]; // 与每行 f 等长的特征名（含跨资产追加维）；旧缓存可能没有
  step: number;
  minTrain: number;
  perSymbol: Record<string, number>;
  rows: FeatureRow[];
}

export function cachePath(): string {
  return join(process.cwd(), "data", "feature-cache.json");
}

export function loadCache(path = cachePath()): FeatureCache {
  return JSON.parse(readFileSync(path, "utf8")) as FeatureCache;
}

/** 每个标的内部按时间（idx 升序）切分：前 trainFrac 作训练，其余作样本外测试。 */
export function splitByTime(rows: FeatureRow[], trainFrac = 0.7): { train: FeatureRow[]; test: FeatureRow[] } {
  const bySym = new Map<string, FeatureRow[]>();
  for (const r of rows) (bySym.get(r.sym) ?? bySym.set(r.sym, []).get(r.sym)!).push(r);
  const train: FeatureRow[] = [];
  const test: FeatureRow[] = [];
  for (const arr of bySym.values()) {
    arr.sort((a, b) => a.idx - b.idx);
    const cut = Math.floor(arr.length * trainFrac);
    for (let i = 0; i < arr.length; i++) (i < cut ? train : test).push(arr[i]);
  }
  return { train, test };
}

export const predict = (row: FeatureRow, params: ModelParams): number => probabilityFromFeature(row.f, row.base, params);

// ---- 指标 ----------------------------------------------------------------
export function brier(rows: FeatureRow[], p: (r: FeatureRow) => number): number {
  if (rows.length === 0) return 0;
  return rows.reduce((a, r) => a + (p(r) - r.y) ** 2, 0) / rows.length;
}

export function logloss(rows: FeatureRow[], p: (r: FeatureRow) => number): number {
  if (rows.length === 0) return 0;
  const eps = 1e-6;
  return -rows.reduce((a, r) => {
    const q = Math.min(1 - eps, Math.max(eps, p(r)));
    return a + (r.y * Math.log(q) + (1 - r.y) * Math.log(1 - q));
  }, 0) / rows.length;
}

export function auc(rows: FeatureRow[], p: (r: FeatureRow) => number): number {
  const scored = rows.map((r) => ({ s: p(r), y: r.y })).sort((a, b) => a.s - b.s);
  let rankSum = 0, pos = 0;
  const neg = scored.filter((x) => x.y === 0).length;
  let i = 0;
  while (i < scored.length) {
    let j = i;
    while (j < scored.length && scored[j].s === scored[i].s) j++;
    const avgRank = (i + j - 1) / 2 + 1;
    for (let k = i; k < j; k++) if (scored[k].y === 1) { rankSum += avgRank; pos++; }
    i = j;
  }
  if (pos === 0 || neg === 0) return 0.5;
  return (rankSum - (pos * (pos + 1)) / 2) / (pos * neg);
}

export interface Scorecard {
  n: number;
  baseRate: number;
  brierModel: number;
  brierBase: number;
  skill: number; // 1 - brierModel/brierBase，>0 才比「永远报基准率」强
  auc: number;
  logloss: number;
  buckets: { pMin: number; pMax: number; upRate: number; nPred: number; count: number }[];
}

export function score(rows: FeatureRow[], params: ModelParams, nBuckets = 5): Scorecard {
  const p = (r: FeatureRow) => predict(r, params);
  const baseRate = rows.length ? rows.reduce((a, r) => a + r.y, 0) / rows.length : 0.5;
  const brierModel = brier(rows, p);
  const brierBase = brier(rows, (r) => r.base); // 对照：点-时基准率本身
  const sorted = [...rows].sort((a, b) => p(a) - p(b));
  const buckets: Scorecard["buckets"] = [];
  for (let b = 0; b < nBuckets; b++) {
    const part = sorted.slice(Math.floor((b * sorted.length) / nBuckets), Math.floor(((b + 1) * sorted.length) / nBuckets));
    if (part.length === 0) continue;
    buckets.push({
      pMin: +p(part[0]).toFixed(3),
      pMax: +p(part[part.length - 1]).toFixed(3),
      upRate: +(part.filter((r) => r.y === 1).length / part.length).toFixed(3),
      nPred: +(part.reduce((a, r) => a + p(r), 0) / part.length).toFixed(3),
      count: part.length,
    });
  }
  return {
    n: rows.length,
    baseRate: +baseRate.toFixed(4),
    brierModel: +brierModel.toFixed(5),
    brierBase: +brierBase.toFixed(5),
    skill: +(brierBase > 0 ? 1 - brierModel / brierBase : 0).toFixed(4),
    auc: +auc(rows, p).toFixed(4),
    logloss: +logloss(rows, p).toFixed(5),
    buckets,
  };
}

export function printScorecard(label: string, sc: Scorecard): void {
  console.log(`\n== ${label} ==  n=${sc.n}  baseRate=${sc.baseRate}`);
  console.log(`  Brier(model)=${sc.brierModel}  Brier(base)=${sc.brierBase}  skill=${sc.skill}  AUC=${sc.auc}  logloss=${sc.logloss}`);
  console.log("  校准分桶（pMax 越高 upRate 应越高、nPred≈upRate 表示校准好）：");
  for (const b of sc.buckets) console.log(`    p∈[${b.pMin},${b.pMax}]  实际涨率=${b.upRate}  预测均值=${b.nPred}  (${b.count})`);
}

// ---- 差分进化拟合（fit-model 与 cv-model 共用，保证同一优化器）-------------
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface FitOpts {
  lambda?: number;  // L2 正则
  gens?: number;
  pop?: number;
  seed?: number;
  dim?: number;     // 特征权重维数；默认取 train[0].f.length
}

/**
 * 在给定训练集上用差分进化拟合校准层权重（目标 = Brier + λ·Σw²）。
 * 种群植入「DEFAULT_MODEL_PARAMS 零填充至 dim」作为种子，保证不劣于现状。
 */
export function fitWeights(train: FeatureRow[], opts: FitOpts = {}): ModelParams {
  const NF = opts.dim ?? train[0]?.f.length ?? DEFAULT_MODEL_PARAMS.weights.length;
  const DIM = NF + 1;
  const LAMBDA = opts.lambda ?? 0.02;
  const GENERATIONS = opts.gens ?? 150;
  const POP = opts.pop ?? 48;
  const W_LO = -1, W_HI = 1, T_LO = 0.02, T_HI = 0.6, F = 0.6, CR = 0.9;
  const lo = (k: number) => (k < NF ? W_LO : T_LO);
  const hi = (k: number) => (k < NF ? W_HI : T_HI);
  const toParams = (x: number[]): ModelParams => ({ weights: x.slice(0, NF), maxTilt: x[NF] });
  const clampDim = (x: number[]) => x.map((v, k) => Math.min(hi(k), Math.max(lo(k), v)));
  const objective = (x: number[]): number => {
    const params = toParams(x);
    return brier(train, (r) => predict(r, params)) + LAMBDA * x.slice(0, NF).reduce((a, w) => a + w * w, 0);
  };
  const rng = mulberry32(opts.seed ?? 1);

  const seed = DEFAULT_MODEL_PARAMS.weights.slice(0, NF);
  while (seed.length < NF) seed.push(0); // 维数不足补 0；超出则截断（适配不同特征集）
  const pop: number[][] = [clampDim([...seed, DEFAULT_MODEL_PARAMS.maxTilt])];
  while (pop.length < POP) pop.push(Array.from({ length: DIM }, (_, k) => lo(k) + rng() * (hi(k) - lo(k))));
  let fit = pop.map(objective);

  for (let g = 0; g < GENERATIONS; g++) {
    for (let i = 0; i < POP; i++) {
      let a = i, b = i, c = i;
      while (a === i) a = Math.floor(rng() * POP);
      while (b === i || b === a) b = Math.floor(rng() * POP);
      while (c === i || c === a || c === b) c = Math.floor(rng() * POP);
      const jRand = Math.floor(rng() * DIM);
      const trial = clampDim(pop[i].map((v, k) => (rng() < CR || k === jRand) ? pop[a][k] + F * (pop[b][k] - pop[c][k]) : v));
      const ft = objective(trial);
      if (ft <= fit[i]) { pop[i] = trial; fit[i] = ft; }
    }
  }
  const best = fit.indexOf(Math.min(...fit));
  const p = toParams(pop[best]);
  return { weights: p.weights.map((w) => +w.toFixed(4)), maxTilt: +p.maxTilt.toFixed(4) };
}
