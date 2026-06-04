/**
 * 用差分进化（Differential Evolution）在缓存特征上进化校准层权重，最大化样本外概率校准。
 * 优化器抽到 _fitlib.fitWeights（与 cv-model 共用同一实现）。
 *
 * 防过拟合：① 时间切分（前 70% 训练、后 30% 验证）；② L2 正则（λ·Σw²）；
 *           ③ 种群植入当前 DEFAULT（零填充至维数），保证不劣于现状。
 *
 * 用法：pnpm exec tsx scripts/fit-model.ts [λ=0.02] [代数=150] [种群=48] [trainFrac=0.7] [seed=1]
 *   先跑 scripts/featurize.ts 生成 data/feature-cache.json。
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_MODEL_PARAMS,
  FEATURE_NAMES,
} from "../src/app/watchlist/[id]/_components/market-model";
import { loadCache, splitByTime, score, printScorecard, fitWeights } from "./_fitlib";

const LAMBDA = Number(process.argv[2] ?? 0.02);
const GENERATIONS = Number(process.argv[3] ?? 150);
const POP = Number(process.argv[4] ?? 48);
const TRAIN_FRAC = Number(process.argv[5] ?? 0.7);
const SEED = Number(process.argv[6] ?? 1);

function main() {
  const cache = loadCache();
  const NF = cache.rows[0]?.f.length ?? DEFAULT_MODEL_PARAMS.weights.length;
  const names = cache.featureNames ?? FEATURE_NAMES;
  const { train, test } = splitByTime(cache.rows, TRAIN_FRAC);
  console.log(`缓存：${cache.rows.length} 行（${Object.keys(cache.perSymbol).join(", ")}）  train=${train.length}  test=${test.length}  特征维=${NF}`);
  console.log(`DE：dim=${NF + 1} pop=${POP} gens=${GENERATIONS} λ=${LAMBDA} trainFrac=${TRAIN_FRAC} seed=${SEED}`);

  const fitted = fitWeights(train, { lambda: LAMBDA, gens: GENERATIONS, pop: POP, seed: SEED, dim: NF });

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
  fitted.weights.forEach((w, k) => console.log(`  ${(names[k] ?? `f${k}`).padEnd(11)} ${w >= 0 ? " " : ""}${w}`));
  console.log(`  maxTilt    ${fitted.maxTilt}`);

  console.log("\n把下面这段粘到 market-model.ts 的 DEFAULT_MODEL_PARAMS 即可采用：");
  console.log(`export const DEFAULT_MODEL_PARAMS: ModelParams = {\n  weights: [${fitted.weights.join(", ")}],\n  maxTilt: ${fitted.maxTilt},\n};`);

  const path = join(process.cwd(), "data", "model-params.fitted.json");
  writeFileSync(path, JSON.stringify({ fittedAt: new Date().toISOString(), lambda: LAMBDA, seed: SEED, trainFrac: TRAIN_FRAC, params: fitted, testSkill: score(test, fitted).skill }, null, 2));
  console.log(`\n已写入 ${path}`);
}

main();
