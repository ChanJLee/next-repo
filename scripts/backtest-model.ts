/**
 * 走查式（walk-forward）样本外回测概率模型。
 *
 * 关键：在每个时间点 t，只把 candles[0..t] 传给模型。
 * 因为 evalStrategies 的命中率、校准模型的相似样本都只来自传入的切片，
 * 且预测点 t 的标签为 null（未来未知），所以这是真正的「点-时」无未来函数预测。
 *
 * 用法：pnpm exec tsx scripts/backtest-model.ts [测试点数=600] [步长=1]
 */
import { prisma } from "../src/lib/db";
import { evalStrategies, combinedProbability, marketState } from "../src/app/watchlist/[id]/_components/market-model";
import type { Candle } from "../src/lib/data/yahoo";

const HORIZON = 10;
const TEST_POINTS = Number(process.argv[2] ?? 600);
const STEP = Number(process.argv[3] ?? 1);
const MIN_TRAIN = 400; // 起步至少要有这么多历史才开始预测

interface Sample {
  prob: number;
  label: number;
  ret: number;
}

function auc(samples: Sample[]): number {
  // Mann-Whitney U：随机取一正一负样本，正样本概率更高的比例
  const sorted = [...samples].sort((a, b) => a.prob - b.prob);
  let rankSum = 0;
  let i = 0;
  let pos = 0;
  const neg = sorted.filter((s) => s.label === 0).length;
  while (i < sorted.length) {
    let j = i;
    while (j < sorted.length && sorted[j].prob === sorted[i].prob) j++;
    const avgRank = (i + j - 1) / 2 + 1;
    for (let k = i; k < j; k++) {
      if (sorted[k].label === 1) {
        rankSum += avgRank;
        pos++;
      }
    }
    i = j;
  }
  if (pos === 0 || neg === 0) return 0.5;
  return (rankSum - (pos * (pos + 1)) / 2) / (pos * neg);
}

function brier(samples: Sample[], probOf: (s: Sample) => number): number {
  return samples.reduce((a, s) => a + (probOf(s) - s.label) ** 2, 0) / samples.length;
}

function buckets(samples: Sample[], n = 5) {
  const sorted = [...samples].sort((a, b) => a.prob - b.prob);
  const out = [];
  for (let b = 0; b < n; b++) {
    const part = sorted.slice(Math.floor((b * sorted.length) / n), Math.floor(((b + 1) * sorted.length) / n));
    if (part.length === 0) continue;
    out.push({
      bucket: b + 1,
      pMin: +part[0].prob.toFixed(3),
      pMax: +part[part.length - 1].prob.toFixed(3),
      upRate: +(part.filter((r) => r.label === 1).length / part.length).toFixed(3),
      avgRetPct: +((100 * part.reduce((a, r) => a + r.ret, 0)) / part.length).toFixed(2),
      nPredAvg: +(part.reduce((a, r) => a + r.prob, 0) / part.length).toFixed(3),
    });
  }
  return out;
}

async function main() {
  const symbols = await prisma.symbol.findMany({
    include: { strategies: { where: { enabled: true } }, candles: { orderBy: { date: "asc" } } },
  });

  for (const s of symbols) {
    const candles: Candle[] = s.candles.map((c) => ({ date: c.date, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume }));
    const strategies = s.strategies.map((st) => ({ id: st.id, name: st.name, kind: st.kind, params: st.params }));
    const n = candles.length;
    if (n < MIN_TRAIN + HORIZON + 50 || strategies.length === 0) {
      console.log(`[${s.ticker}] 跳过：candles=${n} strategies=${strategies.length}`);
      continue;
    }

    const lastPredictable = n - 1 - HORIZON; // 该点之后才有完整标签
    const startT = Math.max(MIN_TRAIN, lastPredictable - TEST_POINTS + 1);

    const samples: Sample[] = [];
    const t0 = Date.now();
    for (let t = startT; t <= lastPredictable; t += STEP) {
      const slice = candles.slice(0, t + 1);
      const evals = evalStrategies(slice, strategies);
      const st = marketState(slice.map((c) => c.close));
      const prob = combinedProbability(slice, evals, st.weights).pUp;
      const ret = candles[t + HORIZON].close / candles[t].close - 1;
      samples.push({ prob, label: ret > 0 ? 1 : 0, ret });
    }

    const baseRate = samples.reduce((a, s) => a + s.label, 0) / samples.length;
    const result = {
      ticker: s.ticker,
      horizon: HORIZON,
      testPoints: samples.length,
      step: STEP,
      baseRate: +baseRate.toFixed(3),
      auc: +auc(samples).toFixed(3),
      brierModel: +brier(samples, (x) => x.prob).toFixed(4),
      brierBase: +brier(samples, () => baseRate).toFixed(4),
      // 决策价值：只在 prob>0.55 时做多 vs 一直持有
      meanRetAll: +((100 * samples.reduce((a, x) => a + x.ret, 0)) / samples.length).toFixed(3),
      elapsedMs: Date.now() - t0,
      buckets: buckets(samples, 5),
    };
    console.log(JSON.stringify(result, null, 2));
  }

  await prisma.$disconnect();
}

main();
