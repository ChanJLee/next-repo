/**
 * 校准监控（reliability diagram + Brier/skill + ECE）—— 业界标准的"预测质量"看板。
 *
 * 复用 featurize.ts 产出的走查特征缓存（data/feature-cache.json，无未来函数），
 * 在「样本外（按时间切分的后段）」上评估当前 DEFAULT_MODEL_PARAMS（或指定 params json），
 * 输出：
 *   · Brier(model) / Brier(base) / skill（=1-model/base，>0 才比"永远报基准率"强）
 *   · AUC / logloss
 *   · 可靠性图：把预测概率分箱，看每箱「预测均值 vs 实际涨率」是否贴合对角线
 *   · ECE（期望校准误差）/ MCE（最大校准误差）
 * 结果持久化到 data/calibration-report.json，便于定期跑、追踪漂移。
 *
 * 用法：
 *   pnpm exec tsx scripts/monitor-calibration.ts                  # 评当前 DEFAULT_MODEL_PARAMS（样本外）
 *   pnpm exec tsx scripts/monitor-calibration.ts <params.json>    # 评指定 params
 *   pnpm exec tsx scripts/monitor-calibration.ts <params.json> --all      # 评全样本（非仅样本外）
 *   pnpm exec tsx scripts/monitor-calibration.ts --gate           # skill<=0 时以退出码 1 失败（给 CI/cron 用）
 *
 * 注意：这是对「点-时模型」的诚实评估；线上图表历史曲线走的是全样本旁路（market-model.ts:419-421
 *       已标注），两者不要混淆——监控以本脚本（走查缓存）为准。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_MODEL_PARAMS, type ModelParams } from "../src/app/watchlist/[id]/_components/market-model";
import { loadCache, splitByTime, predict, brier, auc, logloss, type FeatureRow } from "./_fitlib";

const args = process.argv.slice(2);
const gate = args.includes("--gate");
const useAll = args.includes("--all");
const pathArg = args.find((a) => !a.startsWith("--"));
const TRAIN_FRAC = 0.7;
const N_BINS = 10;

function loadParams(): { label: string; params: ModelParams } {
  if (!pathArg) return { label: "DEFAULT_MODEL_PARAMS", params: DEFAULT_MODEL_PARAMS };
  const raw = JSON.parse(readFileSync(pathArg, "utf8"));
  return { label: pathArg, params: raw.params ?? raw };
}

interface Bin {
  lo: number;
  hi: number;
  count: number;
  predMean: number; // 该箱预测概率均值
  upRate: number;   // 该箱实际涨率
  gap: number;      // |predMean - upRate|
}

/** 固定宽度可靠性图：因偏移被 maxTilt 收窄，预测集中在基准率附近，故按 [min,max] 自适应分箱。 */
function reliability(rows: FeatureRow[], params: ModelParams): { bins: Bin[]; ece: number; mce: number } {
  const ps = rows.map((r) => predict(r, params));
  const lo = Math.min(...ps);
  const hi = Math.max(...ps);
  const span = hi - lo || 1e-9;
  const acc = Array.from({ length: N_BINS }, () => ({ n: 0, sp: 0, sy: 0 }));
  for (let i = 0; i < rows.length; i++) {
    let b = Math.floor(((ps[i] - lo) / span) * N_BINS);
    if (b >= N_BINS) b = N_BINS - 1;
    if (b < 0) b = 0;
    acc[b].n++;
    acc[b].sp += ps[i];
    acc[b].sy += rows[i].y;
  }
  const bins: Bin[] = [];
  let ece = 0;
  let mce = 0;
  for (let b = 0; b < N_BINS; b++) {
    const a = acc[b];
    if (a.n === 0) continue;
    const predMean = a.sp / a.n;
    const upRate = a.sy / a.n;
    const gap = Math.abs(predMean - upRate);
    bins.push({
      lo: +(lo + (span * b) / N_BINS).toFixed(4),
      hi: +(lo + (span * (b + 1)) / N_BINS).toFixed(4),
      count: a.n,
      predMean: +predMean.toFixed(4),
      upRate: +upRate.toFixed(4),
      gap: +gap.toFixed(4),
    });
    ece += (a.n / rows.length) * gap;
    if (gap > mce) mce = gap;
  }
  return { bins, ece: +ece.toFixed(4), mce: +mce.toFixed(4) };
}

function main() {
  const { label, params } = loadParams();
  const cache = loadCache();
  const rows = useAll ? cache.rows : splitByTime(cache.rows, TRAIN_FRAC).test;
  if (rows.length === 0) {
    console.error("无可评估样本（feature-cache 为空？先跑 pnpm model:featurize）");
    process.exit(2);
  }

  const p = (r: FeatureRow) => predict(r, params);
  const baseRate = rows.reduce((a, r) => a + r.y, 0) / rows.length;
  const brierModel = brier(rows, p);
  const brierBase = brier(rows, (r) => r.base); // 对照：点-时基准率本身
  const skill = brierBase > 0 ? 1 - brierModel / brierBase : 0;
  const { bins, ece, mce } = reliability(rows, params);

  const report = {
    createdAt: new Date().toISOString(),
    cacheCreatedAt: cache.createdAt,
    params: label,
    horizon: cache.horizon,
    scope: useAll ? "all" : "out-of-sample(test 30%)",
    symbols: Object.keys(cache.perSymbol),
    n: rows.length,
    baseRate: +baseRate.toFixed(4),
    brierModel: +brierModel.toFixed(5),
    brierBase: +brierBase.toFixed(5),
    skill: +skill.toFixed(4),
    auc: +auc(rows, p).toFixed(4),
    logloss: +logloss(rows, p).toFixed(5),
    ece,
    mce,
    bins,
  };

  const out = join(process.cwd(), "data", "calibration-report.json");
  writeFileSync(out, JSON.stringify(report, null, 2));

  console.log(`\n== 校准监控（${report.scope}） ==  n=${report.n}  baseRate=${report.baseRate}`);
  console.log(`  Brier(model)=${report.brierModel}  Brier(base)=${report.brierBase}  skill=${report.skill}`);
  console.log(`  AUC=${report.auc}  logloss=${report.logloss}  ECE=${report.ece}  MCE=${report.mce}`);
  console.log("  可靠性图（predMean≈upRate 表示校准好；gap 越小越贴对角线）：");
  for (const b of bins) {
    const bar = "█".repeat(Math.round(b.upRate * 20));
    console.log(`    p∈[${b.lo.toFixed(3)},${b.hi.toFixed(3)}]  预测=${b.predMean.toFixed(3)}  实际=${b.upRate.toFixed(3)}  gap=${b.gap.toFixed(3)}  n=${String(b.count).padStart(5)}  ${bar}`);
  }
  console.log(`\n  写入 ${out}`);

  if (skill <= 0) {
    console.log(`\n  ⚠️  skill=${report.skill} ≤ 0：模型未跑赢"永远报基准率"，建议重拟合或检查数据漂移。`);
    if (gate) process.exit(1);
  } else {
    console.log(`\n  ✅ skill=${report.skill} > 0：优于基准率基线。`);
  }
}

main();
