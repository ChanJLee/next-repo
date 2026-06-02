/**
 * 给任意一组模型参数打分（样本外）。改完 market-model.ts 的 DEFAULT_MODEL_PARAMS 后跑它，
 * 立刻看到「好坏程度」，无需重跑慢的 featurize（只要没改特征工程）。
 *
 * 用法：
 *   pnpm exec tsx scripts/eval-model.ts            # 评 market-model 当前 DEFAULT_MODEL_PARAMS
 *   pnpm exec tsx scripts/eval-model.ts <json路径>  # 评指定 params json（如 data/model-params.fitted.json）
 *   pnpm exec tsx scripts/eval-model.ts <json> 0.7  # 自定 trainFrac（默认 0.7）
 */
import { readFileSync } from "node:fs";
import { DEFAULT_MODEL_PARAMS, type ModelParams } from "../src/app/watchlist/[id]/_components/market-model";
import { loadCache, splitByTime, score, printScorecard } from "./_fitlib";

const arg = process.argv[2];
const TRAIN_FRAC = Number(process.argv[3] ?? 0.7);

function loadParams(): { label: string; params: ModelParams } {
  if (!arg) return { label: "DEFAULT_MODEL_PARAMS（market-model.ts）", params: DEFAULT_MODEL_PARAMS };
  const raw = JSON.parse(readFileSync(arg, "utf8"));
  const params: ModelParams = raw.params ?? raw; // 兼容 fitted.json 与裸 params
  return { label: arg, params };
}

function main() {
  const { label, params } = loadParams();
  const cache = loadCache();
  const { train, test } = splitByTime(cache.rows, TRAIN_FRAC);
  console.log(`参数：${label}`);
  console.log(`weights=[${params.weights.join(", ")}] maxTilt=${params.maxTilt}`);
  console.log(`缓存 ${cache.rows.length} 行（${Object.keys(cache.perSymbol).join(", ")}）`);
  printScorecard("train", score(train, params));
  printScorecard("TEST (样本外，headline)", score(test, params));
}

main();
