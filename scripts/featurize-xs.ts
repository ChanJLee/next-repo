/**
 * 截面（cross-sectional）特征化实验 —— 测「相对强弱」框架能否过滤滚动 CV。
 *
 * 与单标的管线的根本区别：
 *   · 标的池：多样化、低相关（输家/价值/防御/周期/板块ETF/非美 + 少量赢家），从 Stooq 现拉，不入库。
 *   · 标签：每个交易日把当日有数据的标的按【未来 H 日收益】排序，label = 是否跑赢当日中位
 *     （相对 rank，抵消大盘共同 beta —— 理论上比单标的绝对方向更可学）。
 *   · 特征：每个标的的价格类特征（复用 buildFeature，无策略 → evidence=0），再【按当日截面去均值】
 *     变成纯相对量；市场级跨资产特征对截面是常数、去均值后为 0，故不用。
 *   · 基准率：标签的点-时历史均值（≈0.5）。
 *
 * 产出 _fitlib 兼容缓存（默认 data/feature-cache-xs.json），交给 `pnpm model:cv <file>` 验收。
 *
 * 用法：pnpm exec tsx scripts/featurize-xs.ts [每标的最多取样日=600] [步长=5] [horizon=20] [outFile=feature-cache-xs.json]
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildFeature, FEATURE_NAMES, NUM_FEATURES } from "../src/app/watchlist/[id]/_components/market-model";
import { getDailyCandlesFromStooq } from "../src/lib/data/stooq";
import type { Candle } from "../src/lib/data/yahoo";
import type { FeatureRow } from "./_fitlib";

const MAX_SAMPLE_DATES = Number(process.argv[2] ?? 600);
const STEP = Math.max(1, Number(process.argv[3] ?? 5));
const HORIZON = Number(process.argv[4] ?? 20);
const OUT_FILE = process.argv[5] ?? "feature-cache-xs.json";
// 模式：xs=截面 rank 标签 + 当日去均值特征；abs=绝对涨跌标签 + 原始特征（用于在中性池上测动量/反转）
const MODE = (process.argv[6] ?? "xs") as "xs" | "abs";
const MIN_SYMBOLS = 10;     // 当日至少这么多标的才能算截面 rank
const MIN_BARS = 320;       // 标的至少这么多 K 线才纳入
const W = { trend: 1, reversion: 1, pattern: 1 } as const;

// 多样化标的池：输家/价值/防御/周期/板块ETF/非美 + 少量赢家做对照（与 backtest-signals 一致）
const UNIVERSE = [
  "INTC", "T", "WBA", "PFE", "PYPL", "DIS", "BABA", "VZ", "CSCO", "IBM", "NKE", "MMM", "KHC", "PARA",
  "KO", "PG", "JNJ", "WMT", "XLU", "XLP",
  "F", "GM", "BAC", "XOM", "GE", "C",
  "SPY", "QQQM", "IWM", "XLF", "XLE", "EEM",
  "AAPL", "MSFT", "NVDA", "GOOGL",
];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface SymData { ticker: string; candles: Candle[]; idxByDate: Map<string, number> }

async function main() {
  const t0 = Date.now();
  // 1) 拉取标的池
  const syms: SymData[] = [];
  for (const tk of UNIVERSE) {
    try {
      const candles = await getDailyCandlesFromStooq(tk, 99999);
      if (candles.length >= MIN_BARS) {
        const idxByDate = new Map<string, number>();
        candles.forEach((c, i) => idxByDate.set(c.date.toISOString().slice(0, 10), i));
        syms.push({ ticker: tk, candles, idxByDate });
      }
      process.stdout.write(`\r拉取 ${tk}: ${candles.length} 根   `);
    } catch (e) {
      console.log(`\n${tk} 失败: ${e instanceof Error ? e.message : e}`);
    }
    await sleep(1100);
  }
  console.log(`\n标的池就绪：${syms.length}/${UNIVERSE.length} 个`);

  // 2) 取样日：所有标的日期的并集，取最近 MAX_SAMPLE_DATES×STEP 天里每 STEP 个
  const allDates = [...new Set(syms.flatMap((s) => s.candles.map((c) => c.date.toISOString().slice(0, 10))))].sort();
  const recent = allDates.slice(-MAX_SAMPLE_DATES * STEP);
  const sampleDates = recent.filter((_, k) => k % STEP === 0);
  console.log(`取样日 ${sampleDates.length} 个（${sampleDates[0]} ~ ${sampleDates[sampleDates.length - 1]}）`);

  // 3) 逐取样日算截面：每个标的的特征向量 + 未来 H 日收益 → 截面去均值 + 中位分标签
  const rows: FeatureRow[] = [];
  let done = 0;
  for (const d of sampleDates) {
    const recs: { ticker: string; idx: number; f: number[]; fwd: number }[] = [];
    for (const s of syms) {
      const i = s.idxByDate.get(d);
      if (i == null || i < 60 || i + HORIZON >= s.candles.length) continue;
      const { feature } = buildFeature(s.candles.slice(0, i + 1), [], W, i);
      if (!feature) continue;
      const fwd = s.candles[i].close > 0 ? s.candles[i + HORIZON].close / s.candles[i].close - 1 : 0;
      recs.push({ ticker: s.ticker, idx: i, f: feature, fwd });
    }
    if (MODE === "abs") {
      // 绝对模式：原始特征 + 绝对涨跌标签（不要求凑齐截面）
      for (const r of recs) {
        rows.push({ sym: r.ticker, idx: r.idx, date: d, f: r.f.map((v) => +v.toFixed(5)), y: r.fwd > 0 ? 1 : 0, base: 0 });
      }
      done += 1; continue;
    }
    if (recs.length < MIN_SYMBOLS) continue;
    // 截面去均值（每维减当日均值）→ 纯相对特征
    const dim = recs[0].f.length;
    const mean = new Array(dim).fill(0);
    for (const r of recs) for (let k = 0; k < dim; k++) mean[k] += r.f[k] / recs.length;
    // 中位数 → 相对 rank 标签
    const med = [...recs.map((r) => r.fwd)].sort((a, b) => a - b)[Math.floor(recs.length / 2)];
    for (const r of recs) {
      rows.push({
        sym: r.ticker,
        idx: r.idx,
        date: d,
        f: r.f.map((v, k) => +(v - mean[k]).toFixed(5)),
        y: r.fwd > med ? 1 : 0,
        base: 0, // 占位，下面统一填点-时基准率
      });
    }
    if (++done % 50 === 0) process.stdout.write(`\r截面 ${done}/${sampleDates.length} 日…`);
  }

  // 4) 点-时基准率：按日期排序，base = 此前所有已实现标签的均值（≈0.5）
  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  let cum = 0, cnt = 0, curDate = "";
  let pending: { sum: number; n: number } = { sum: 0, n: 0 };
  for (const r of rows) {
    if (r.date !== curDate) { cum += pending.sum; cnt += pending.n; pending = { sum: 0, n: 0 }; curDate = r.date; }
    r.base = +(cnt > 0 ? cum / cnt : 0.5).toFixed(5);
    pending.sum += r.y; pending.n += 1;
  }

  const perSymbol: Record<string, number> = {};
  for (const r of rows) perSymbol[r.sym] = (perSymbol[r.sym] ?? 0) + 1;
  const out = {
    createdAt: new Date().toISOString(),
    horizon: HORIZON,
    numFeatures: NUM_FEATURES,
    featureNames: [...FEATURE_NAMES],
    step: STEP,
    minTrain: 0,
    perSymbol,
    rows,
  };
  const path = join(process.cwd(), "data", OUT_FILE);
  writeFileSync(path, JSON.stringify(out));
  console.log(`\n写入 ${path}：${rows.length} 行，${Object.keys(perSymbol).length} 标的，H=${HORIZON}，用时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main();
