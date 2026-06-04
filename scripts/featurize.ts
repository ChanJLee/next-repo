/**
 * 走查式（walk-forward）特征预计算 —— 拟合/评估的「慢且只跑一次」的部分。
 *
 * 在每个时间点 t，只用 candles[0..t]：
 *   · 点-时各策略命中率（evalStrategies）→ 点-时市场状态权重（marketState）
 *   · 9 维特征向量（buildFeature，含点-时 Hurst）
 *   · 标签 y = 未来 HORIZON 日收盘价更高
 *   · 点-时基准率 baseRate_t = 历史 [0, t-H] 的上涨率（与模型内部一致）
 * 全部无未来函数。结果写入 data/feature-cache.json，供 fit-model / eval-model 复用。
 *
 * 用法：pnpm exec tsx scripts/featurize.ts [每标的最多点数=all] [步长=1] [最少训练=400]
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "../src/lib/db";
import {
  evalStrategies,
  marketState,
  buildFeature,
  CALIBRATION_HORIZON,
  NUM_FEATURES,
  NUM_CROSS_FEATURES,
  FEATURE_NAMES,
  CROSS_FEATURE_NAMES,
  type CrossAssetContext,
} from "../src/app/watchlist/[id]/_components/market-model";
import { getDailyCandlesFromStooq } from "../src/lib/data/stooq";
import type { Candle } from "../src/lib/data/yahoo";
import type { FeatureRow } from "./_fitlib";

const HORIZON = CALIBRATION_HORIZON;
const MAX_POINTS = Number(process.argv[2] ?? Number.POSITIVE_INFINITY);
const STEP = Math.max(1, Number(process.argv[3] ?? 1));
const MIN_TRAIN = Number(process.argv[4] ?? 400);

async function main() {
  const symbols = await prisma.symbol.findMany({
    include: { strategies: { where: { enabled: true } }, candles: { orderBy: { date: "asc" } } },
  });

  // 拉一次大盘(SPY)做跨资产条件特征；失败则退化为全 0（特征维数不变）。
  const spyByDate = new Map<string, number>();
  try {
    const spy = await getDailyCandlesFromStooq("SPY", 99999);
    for (const c of spy) spyByDate.set(c.date.toISOString().slice(0, 10), c.close);
    console.log(`SPY: ${spy.length} 根（${spy[0]?.date.toISOString().slice(0, 10)} ~ ${spy[spy.length - 1]?.date.toISOString().slice(0, 10)}）`);
  } catch (e) {
    console.log(`SPY 拉取失败，跨资产特征将全为 0：${e instanceof Error ? e.message : e}`);
  }

  const rows: FeatureRow[] = [];
  const perSymbol: Record<string, number> = {};
  const t0 = Date.now();

  for (const s of symbols) {
    const candles: Candle[] = s.candles.map((c) => ({ date: c.date, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume }));
    const strategies = s.strategies.map((st) => ({ id: st.id, name: st.name, kind: st.kind, params: st.params }));
    const n = candles.length;

    // 对齐大盘收盘到该标的每根 K 线（前向填充；更早无数据处置 0）
    const mktFull: number[] = [];
    let lastMkt = 0;
    for (const c of candles) {
      const v = spyByDate.get(c.date.toISOString().slice(0, 10));
      if (v != null && v > 0) lastMkt = v;
      mktFull.push(lastMkt);
    }
    const lastPredictable = n - 1 - HORIZON;
    if (lastPredictable < MIN_TRAIN) {
      console.log(`[${s.ticker}] 跳过：candles=${n}（不足 ${MIN_TRAIN}+${HORIZON}）`);
      continue;
    }

    // 标签与基准率前缀和：label[i] = close[i+H] > close[i]
    const label: number[] = [];
    const prefix: number[] = [0];
    for (let i = 0; i <= lastPredictable; i++) {
      const y = candles[i + HORIZON].close > candles[i].close ? 1 : 0;
      label.push(y);
      prefix.push(prefix[i] + y);
    }
    const baseRateAt = (t: number) => prefix[t - HORIZON + 1] / (t - HORIZON + 1); // [0, t-H] 上涨率

    const startT = Math.max(MIN_TRAIN, lastPredictable - (Number.isFinite(MAX_POINTS) ? MAX_POINTS - 1 : lastPredictable));
    let count = 0;
    const symStart = Date.now();
    for (let t = startT; t <= lastPredictable; t += STEP) {
      const slice = candles.slice(0, t + 1);
      const evals = evalStrategies(slice, strategies);
      const st = marketState(slice.map((c) => c.close));
      const cross: CrossAssetContext = { mkt: mktFull.slice(0, t + 1) };
      const { feature } = buildFeature(slice, evals, st.weights, t, undefined, cross);
      if (!feature) continue; // index<60 等情况
      rows.push({ sym: s.ticker, idx: t, date: candles[t].date.toISOString().slice(0, 10), f: feature.map((x) => +x.toFixed(5)), y: label[t], base: +baseRateAt(t).toFixed(5) });
      count++;
      if (count % 100 === 0) process.stdout.write(`\r[${s.ticker}] ${count} 点…`);
    }
    perSymbol[s.ticker] = count;
    console.log(`\r[${s.ticker}] ${count} 点  (${((Date.now() - symStart) / 1000).toFixed(1)}s)        `);
  }

  const out = {
    createdAt: new Date().toISOString(),
    horizon: HORIZON,
    numFeatures: NUM_FEATURES + NUM_CROSS_FEATURES,
    featureNames: [...FEATURE_NAMES, ...CROSS_FEATURE_NAMES],
    step: STEP,
    minTrain: MIN_TRAIN,
    perSymbol,
    rows,
  };
  const path = join(process.cwd(), "data", "feature-cache.json");
  writeFileSync(path, JSON.stringify(out));
  console.log(`\n写入 ${path}：${rows.length} 行，${Object.keys(perSymbol).length} 个标的，用时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  await prisma.$disconnect();
}

main();
