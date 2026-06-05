/**
 * 经典横截面动量因子检验（12−1 个月）—— 价量这口井最后一个值得测的信号。
 *
 * 无参数拟合：规则固定（按过去 12 个月、跳过最近 21 日的收益排名），故只需点-时评估。
 *   · 每个取样日：池内标的按 mom(252→21日前累计收益) 排序，分上半/下半。
 *   · 度量：上半组未来 H 日平均收益 − 下半组（多空 spread），以及上半组上涨率 − 下半组。
 *   · 显著性：按【日期分块】自助（重采样整天）给 spread 的 95% CI；CI>0 才算因子真。
 * 全程 point-in-time（动量只用过去、fwd 是已实现未来），无样本内拟合 → 无未来函数。
 *
 * 用法：pnpm exec tsx scripts/test-xs-momentum.ts [取样日=600] [步长=5] [持有H=21] [自助=2000]
 */
import { getDailyCandlesFromStooq } from "../src/lib/data/stooq";
import { mulberry32 } from "./_fitlib";
import type { Candle } from "../src/lib/data/yahoo";

const MAX_SAMPLE_DATES = Number(process.argv[2] ?? 600);
const STEP = Math.max(1, Number(process.argv[3] ?? 5));
const H = Number(process.argv[4] ?? 21);
const B = Number(process.argv[5] ?? 2000);
// 截面因子：mom=12-1月动量；volmom=波动率调整动量；lowvol=低波动；combo=动量+低波等权(z-score)
const SIGNAL = (process.argv[6] ?? "mom") as "mom" | "volmom" | "lowvol" | "combo";
const FORM_LONG = 252, FORM_SKIP = 21, VOL_WIN = 63, MIN_SYMBOLS = 10, MIN_BARS = 320;

function realizedVol(c: Candle[], i: number, win: number): number {
  const r: number[] = [];
  for (let j = i - win + 1; j <= i; j++) if (c[j - 1]?.close > 0 && c[j]?.close > 0) r.push(Math.log(c[j].close / c[j - 1].close));
  if (r.length < 5) return 0.02;
  const m = r.reduce((a, b) => a + b, 0) / r.length;
  return Math.max(1e-4, Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / r.length));
}

const UNIVERSE = [
  "INTC", "T", "WBA", "PFE", "PYPL", "DIS", "BABA", "VZ", "CSCO", "IBM", "NKE", "MMM", "KHC", "PARA",
  "KO", "PG", "JNJ", "WMT", "XLU", "XLP", "F", "GM", "BAC", "XOM", "GE", "C",
  "SPY", "QQQM", "IWM", "XLF", "XLE", "EEM", "AAPL", "MSFT", "NVDA", "GOOGL",
];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface DayStat { date: string; spread: number; upDiff: number; n: number }

async function main() {
  const syms: { ticker: string; candles: Candle[]; idxByDate: Map<string, number> }[] = [];
  for (const tk of UNIVERSE) {
    try {
      const candles = await getDailyCandlesFromStooq(tk, 99999);
      if (candles.length >= MIN_BARS) {
        const idxByDate = new Map<string, number>();
        candles.forEach((c, i) => idxByDate.set(c.date.toISOString().slice(0, 10), i));
        syms.push({ ticker: tk, candles, idxByDate });
      }
      process.stdout.write(`\r拉取 ${tk}   `);
    } catch { /* skip */ }
    await sleep(1100);
  }
  console.log(`\n标的池 ${syms.length} 个  持有 H=${H} 日  形成期 ${FORM_LONG}→${FORM_SKIP} 日前`);

  const allDates = [...new Set(syms.flatMap((s) => s.candles.map((c) => c.date.toISOString().slice(0, 10))))].sort();
  const sampleDates = allDates.slice(-MAX_SAMPLE_DATES * STEP).filter((_, k) => k % STEP === 0);

  const days: DayStat[] = [];
  for (const d of sampleDates) {
    const recs: { mom: number; vol: number; fwd: number }[] = [];
    for (const s of syms) {
      const i = s.idxByDate.get(d);
      if (i == null || i < FORM_LONG || i + H >= s.candles.length) continue;
      const c = s.candles;
      if (!(c[i - FORM_LONG].close > 0) || !(c[i].close > 0)) continue;
      const mom = c[i - FORM_SKIP].close / c[i - FORM_LONG].close - 1; // 12−1 月动量
      const vol = realizedVol(c, i, VOL_WIN);
      const fwd = c[i + H].close / c[i].close - 1;
      recs.push({ mom, vol, fwd });
    }
    if (recs.length < MIN_SYMBOLS) continue;
    // 截面 z-score（combo 用）
    const zs = (v: number[]) => { const m = v.reduce((a, b) => a + b, 0) / v.length; const sd = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length) || 1; return v.map((x) => (x - m) / sd); };
    const zmom = zs(recs.map((r) => r.mom)), zvol = zs(recs.map((r) => r.vol));
    const sig = recs.map((r, k) =>
      SIGNAL === "mom" ? r.mom
        : SIGNAL === "volmom" ? r.mom / r.vol
        : SIGNAL === "lowvol" ? -r.vol
        : zmom[k] - zvol[k]); // combo：高动量 + 低波动
    const sorted = recs.map((_, k) => k).sort((a, b) => sig[a] - sig[b]).map((k) => recs[k]);
    const half = Math.floor(sorted.length / 2);
    const bot = sorted.slice(0, half), top = sorted.slice(sorted.length - half);
    const mean = (a: { fwd: number }[]) => a.reduce((x, r) => x + r.fwd, 0) / a.length;
    const upr = (a: { fwd: number }[]) => a.filter((r) => r.fwd > 0).length / a.length;
    days.push({ date: d, spread: mean(top) - mean(bot), upDiff: upr(top) - upr(bot), n: recs.length });
  }

  const meanSpread = days.reduce((a, x) => a + x.spread, 0) / days.length;
  const meanUpDiff = days.reduce((a, x) => a + x.upDiff, 0) / days.length;
  // 按日期分块自助（这里每个 day 已是一天的截面统计，直接对 day 重采样）
  const rng = mulberry32(1);
  const boot: number[] = [];
  for (let b = 0; b < B; b++) {
    let s = 0;
    for (let k = 0; k < days.length; k++) s += days[Math.floor(rng() * days.length)].spread;
    boot.push(s / days.length);
  }
  boot.sort((a, b) => a - b);
  const lo = boot[Math.floor(0.025 * B)], hi = boot[Math.floor(0.975 * B)];
  const pPos = boot.filter((x) => x > 0).length / B;
  const pct = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(2)}%`;

  console.log(`\n── 截面因子=${SIGNAL}（12−1动量/波调动量/低波/组合），${days.length} 个截面日，持有 ${H} 日 ──`);
  console.log(`  多空 spread（高动量组 − 低动量组 未来收益）均值 = ${pct(meanSpread)} / ${H}日`);
  console.log(`  上涨率差（高 − 低）= ${(meanUpDiff * 100).toFixed(1)}pp`);
  console.log(`  spread 95% CI = [${pct(lo)}, ${pct(hi)}]   P(spread>0) = ${(pPos * 100).toFixed(1)}%`);
  console.log(`  → ${lo > 0 ? "✅ 动量因子显著为正" : hi < 0 ? "✅ 显著为负（反转）" : "❌ 跨 0，不显著"}`);
}

main();
