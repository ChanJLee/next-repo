/**
 * 用差分进化（Differential Evolution）在缓存特征上进化校准层权重，最大化样本外概率校准。
 *
 * 防过拟合的三重约束：
 *   1) 时间切分：每个标的前 70% 训练、后 30% 仅用于验证（headline 分数取自验证集）。
 *   2) L2 正则：目标里加 λ·Σw²，把权重拉向 0（= 纯基准率的「谦逊」先验），λ 越大越保守。
 *   3) 种群里植入当前默认模型，保证进化结果不会比现状更差。
 *
 * 目标（训练集，越小越好）：Brier + λ·Σw²。Brier 与 Brier-skill 单调，故等价于最大化 skill。
 *
 * 用法：pnpm exec tsx scripts/fit-model.ts [λ=0.02] [代数=150] [种群=48] [trainFrac=0.7] [seed=1]
 *   先跑 scripts/featurize.ts 生成 data/feature-cache.json。
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_MODEL_PARAMS,
  FEATURE_NAMES,
  NUM_FEATURES,
  type ModelParams,
} from "../src/app/watchlist/[id]/_components/market-model";
import { loadCache, splitByTime, brier, predict, score, printScorecard, type FeatureRow } from "./_fitlib";

const LAMBDA = Number(process.argv[2] ?? 0.02);
const GENERATIONS = Number(process.argv[3] ?? 150);
const POP = Number(process.argv[4] ?? 48);
const TRAIN_FRAC = Number(process.argv[5] ?? 0.7);
const SEED = Number(process.argv[6] ?? 1);

const DIM = NUM_FEATURES + 1; // 9 个权重 + maxTilt
const W_LO = -1, W_HI = 1;
const T_LO = 0.02, T_HI = 0.6;

const lo = (k: number) => (k < NUM_FEATURES ? W_LO : T_LO);
const hi = (k: number) => (k < NUM_FEATURES ? W_HI : T_HI);

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(SEED);

const toParams = (x: number[]): ModelParams => ({ weights: x.slice(0, NUM_FEATURES), maxTilt: x[NUM_FEATURES] });
const clampDim = (x: number[]) => x.map((v, k) => Math.min(hi(k), Math.max(lo(k), v)));

function objective(x: number[], train: FeatureRow[]): number {
  const params = toParams(x);
  const b = brier(train, (r) => predict(r, params));
  const reg = LAMBDA * x.slice(0, NUM_FEATURES).reduce((a, w) => a + w * w, 0);
  return b + reg;
}

function main() {
  const cache = loadCache();
  const { train, test } = splitByTime(cache.rows, TRAIN_FRAC);
  console.log(`缓存：${cache.rows.length} 行（${Object.keys(cache.perSymbol).join(", ")}）  train=${train.length}  test=${test.length}`);
  console.log(`DE：dim=${DIM} pop=${POP} gens=${GENERATIONS} λ=${LAMBDA} trainFrac=${TRAIN_FRAC} seed=${SEED}`);

  // ---- 初始化种群（含默认模型作为种子）----
  const pop: number[][] = [];
  pop.push(clampDim([...DEFAULT_MODEL_PARAMS.weights, DEFAULT_MODEL_PARAMS.maxTilt]));
  while (pop.length < POP) {
    pop.push(Array.from({ length: DIM }, (_, k) => lo(k) + rng() * (hi(k) - lo(k))));
  }
  let fit = pop.map((x) => objective(x, train));

  const F = 0.6, CR = 0.9;
  let bestIdx = fit.indexOf(Math.min(...fit));
  for (let g = 0; g < GENERATIONS; g++) {
    for (let i = 0; i < POP; i++) {
      let a = i, b = i, c = i;
      while (a === i) a = Math.floor(rng() * POP);
      while (b === i || b === a) b = Math.floor(rng() * POP);
      while (c === i || c === a || c === b) c = Math.floor(rng() * POP);
      const jRand = Math.floor(rng() * DIM);
      const trial = pop[i].map((v, k) =>
        (rng() < CR || k === jRand) ? pop[a][k] + F * (pop[b][k] - pop[c][k]) : v,
      );
      const trialC = clampDim(trial);
      const ft = objective(trialC, train);
      if (ft <= fit[i]) { pop[i] = trialC; fit[i] = ft; }
    }
    bestIdx = fit.indexOf(Math.min(...fit));
    if ((g + 1) % 25 === 0 || g === GENERATIONS - 1) {
      console.log(`  gen ${g + 1}/${GENERATIONS}  best train-obj=${fit[bestIdx].toFixed(6)}`);
    }
  }

  const fitted = toParams(pop[bestIdx]);
  fitted.weights = fitted.weights.map((w) => +w.toFixed(4));
  fitted.maxTilt = +fitted.maxTilt.toFixed(4);

  // ---- 报告：默认 vs 进化，训练 & 样本外测试 ----
  console.log("\n────────── 当前默认模型 ──────────");
  printScorecard("DEFAULT · train", score(train, DEFAULT_MODEL_PARAMS));
  printScorecard("DEFAULT · TEST (样本外)", score(test, DEFAULT_MODEL_PARAMS));
  console.log("\n────────── 进化后模型 ──────────");
  printScorecard("FITTED · train", score(train, fitted));
  printScorecard("FITTED · TEST (样本外)", score(test, fitted));

  const dTest = score(test, fitted).skill - score(test, DEFAULT_MODEL_PARAMS).skill;
  console.log(`\n样本外 Brier-skill 变化：${dTest >= 0 ? "+" : ""}${dTest.toFixed(4)}（>0 表示进化后在没见过的数据上更准）`);

  console.log("\n各因子权重（进化后）：");
  fitted.weights.forEach((w, k) => console.log(`  ${FEATURE_NAMES[k].padEnd(10)} ${w >= 0 ? " " : ""}${w}`));
  console.log(`  maxTilt    ${fitted.maxTilt}`);

  console.log("\n把下面这段粘到 market-model.ts 的 DEFAULT_MODEL_PARAMS 即可采用：");
  console.log(`export const DEFAULT_MODEL_PARAMS: ModelParams = {\n  weights: [${fitted.weights.join(", ")}],\n  maxTilt: ${fitted.maxTilt},\n};`);

  const path = join(process.cwd(), "data", "model-params.fitted.json");
  writeFileSync(path, JSON.stringify({ fittedAt: new Date().toISOString(), lambda: LAMBDA, seed: SEED, trainFrac: TRAIN_FRAC, params: fitted, testSkill: score(test, fitted).skill }, null, 2));
  console.log(`\n已写入 ${path}`);
}

main();
