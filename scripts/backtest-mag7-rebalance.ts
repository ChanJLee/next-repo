/**
 * 验证「七姐妹内部 卖涨补跌」策略，权重按【盈利能力=净利润】设定（时变, point-in-time）。
 *
 * 用户想法：七姐妹是赢家股，谁跌多了买、谁涨多了卖来补仓，循环往复。
 * 修正：目标权重不是等权，而是按各公司【当时已公布的年度净利润】占比设定——
 *   赚得多的票该多拿。再平衡 = 当价格涨跌使持仓偏离「盈利权重」时，卖超配买低配拉回。
 *
 * 净利润取 SEC EDGAR 年度（10-K）口径，按 filed≤再平衡日 取最新（无未来函数）；
 * 亏损（净利≤0）当期权重置 0（不补不盈利的票），全亏则退化为等权。
 *
 * 对比基准：买入持有(盈利权重/等权) + SPY。指标：CAGR/波动/夏普/最大回撤/年换手。
 * 数据：价格用本地缓存复权收盘；净利润用 EDGAR（缓存到 scratchpad，重跑免重拉）。
 * 用法：pnpm exec tsx scripts/backtest-mag7-rebalance.ts
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { resolveCik, getCompanyFacts, factSeries, pitFact } from "../src/lib/data/edgar";

// 缓存只含七姐妹中的 5 只 + SPY（AMZN/META 待实时源恢复后补；机制结论不受影响）。
const MAG7 = ["AAPL", "MSFT", "GOOGL", "NVDA", "TSLA"];
const BENCH = ["SPY"];
const TX_BPS = 5;
const SCRATCH = "/private/tmp/claude-501/-Users-chan-Documents-next-repo/bfea884d-c5ec-41dd-a2eb-b09e45f35fde/scratchpad";

type Series = Map<string, number>;
interface AnnualNI { end: string; filed: string; val: number } // 年度净利润事实
interface Fund { ni: AnnualNI[]; shares: number } // 净利序列 + 最新股本（用于市值）

function loadPrices(tickers: string[]): Map<string, Series> {
  const cache = JSON.parse(readFileSync(join(process.cwd(), "data", "universe-candles.json"), "utf8")) as {
    candles: Record<string, { date: string; close: number }[]>;
  };
  const out = new Map<string, Series>();
  for (const t of tickers) {
    const arr = cache.candles[t];
    if (!arr) throw new Error(`缓存缺 ${t}`);
    const s: Series = new Map();
    for (const c of arr) if (c.close > 0) s.set(c.date, c.close);
    out.set(t, s);
    console.log(`  ${t}: ${s.size} 日 (${arr[0].date}→${arr.at(-1)!.date})`);
  }
  return out;
}

const dayDiff = (a: string, b: string) => Math.abs((Date.parse(a) - Date.parse(b)) / 86400_000);

/** 取某票的年度净利润序列 + 最新股本（缓存到 scratchpad）。 */
async function loadFund(ticker: string): Promise<Fund> {
  const cacheFile = join(SCRATCH, `fund-${ticker}.json`);
  if (existsSync(cacheFile)) return JSON.parse(readFileSync(cacheFile, "utf8")) as Fund;
  const cik = await resolveCik(ticker);
  if (!cik) throw new Error(`无 CIK: ${ticker}`);
  const facts = await getCompanyFacts(cik);
  // 年度净利润：NetIncomeLoss(USD)，区间 ≈365 天
  const ni = factSeries(facts, "NetIncomeLoss", "USD")
    .filter((f) => f.start && dayDiff(f.end, f.start) >= 330 && dayDiff(f.end, f.start) <= 400)
    .map((f) => ({ end: f.end, filed: f.filed, val: f.val }));
  // 最新股本（dei 封面口径，当前=后复权一致基准）→ 配合后复权价算「拆股一致」的市值
  const today = new Date().toISOString().slice(0, 10);
  const shares =
    pitFact(facts, "EntityCommonStockSharesOutstanding", "shares", today, { taxonomy: "dei" })?.val ??
    pitFact(facts, "CommonStockSharesOutstanding", "shares", today)?.val ??
    0;
  const fund: Fund = { ni, shares };
  writeFileSync(cacheFile, JSON.stringify(fund));
  console.log(`  ${ticker}: ${ni.length} 条年度净利 (最新 $${((ni.at(-1)?.val ?? 0) / 1e9).toFixed(1)}B) · 股本 ${(shares / 1e9).toFixed(2)}B`);
  await new Promise((r) => setTimeout(r, 300));
  return fund;
}

/** PIT 净利润：filed≤asOf 中，期末最新的一条（同期末取 filed 最新）。亏损或缺失返回 0。 */
function pitNI(facts: AnnualNI[], asOf: string): number {
  const elig = facts.filter((f) => f.filed <= asOf);
  if (elig.length === 0) return 0;
  const best = elig.reduce((b, f) => (f.end > b.end || (f.end === b.end && f.filed > b.filed) ? f : b));
  return Math.max(0, best.val); // 亏损不补 → 0
}

function commonDates(series: Series[]): string[] {
  let dates = [...series[0].keys()];
  for (let i = 1; i < series.length; i++) dates = dates.filter((d) => series[i].has(d));
  return dates.sort();
}

interface Metrics { name: string; totalRet: number; cagr: number; vol: number; sharpe: number; maxDD: number; turnoverPerYr: number }

/** 组合模拟。targetAt(dateIdx)→目标权重（时变）；shouldRebal 决定何时拉回目标。 */
function simulate(
  priceMatrix: number[][],
  targetAt: (t: number) => number[],
  shouldRebal: (t: number, weights: number[]) => boolean,
  txBps: number,
): { equity: number[]; turnoverPerYr: number } {
  const T = priceMatrix.length;
  const N = priceMatrix[0].length;
  let h = targetAt(0).map((w) => w);
  const equity: number[] = [];
  let totalTurnover = 0;
  for (let t = 0; t < T; t++) {
    if (t > 0) for (let i = 0; i < N; i++) h[i] *= priceMatrix[t][i] / priceMatrix[t - 1][i];
    let V = h.reduce((a, b) => a + b, 0);
    const weights = h.map((x) => x / V);
    if (t > 0 && shouldRebal(t, weights)) {
      const tgt = targetAt(t);
      const newH = tgt.map((w) => w * V);
      const turnover = newH.reduce((s, nh, i) => s + Math.abs(nh - h[i]), 0) / V;
      const cost = (txBps / 10000) * turnover * V;
      V -= cost;
      h = tgt.map((w) => w * V);
      totalTurnover += turnover;
    }
    equity.push(V);
  }
  return { equity, turnoverPerYr: totalTurnover / (T / 252) };
}

function metricsOf(name: string, equity: number[], turnoverPerYr: number): Metrics {
  const T = equity.length;
  const years = T / 252;
  const totalRet = equity[T - 1] / equity[0] - 1;
  const cagr = Math.pow(equity[T - 1] / equity[0], 1 / years) - 1;
  const rets: number[] = [];
  for (let t = 1; t < T; t++) rets.push(equity[t] / equity[t - 1] - 1);
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const vol = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length) * Math.sqrt(252);
  const sharpe = (mean * 252) / vol;
  let peak = equity[0], maxDD = 0;
  for (const v of equity) { if (v > peak) peak = v; const dd = v / peak - 1; if (dd < maxDD) maxDD = dd; }
  return { name, totalRet, cagr, vol, sharpe, maxDD, turnoverPerYr };
}

function singleAsset(prices: number[]): number[] {
  const eq: number[] = []; let v = 1;
  for (let t = 0; t < prices.length; t++) { if (t > 0) v *= prices[t] / prices[t - 1]; eq.push(v); }
  return eq;
}

async function main() {
  console.log("读取价格缓存...");
  const px = loadPrices([...MAG7, ...BENCH]);
  console.log("读取 EDGAR 净利润 + 股本（PIT）...");
  const fundOf = new Map<string, Fund>();
  for (const t of MAG7) fundOf.set(t, await loadFund(t));

  const dates = commonDates([...MAG7, ...BENCH].map((t) => px.get(t)!));
  console.log(`\n共同窗口：${dates[0]} → ${dates.at(-1)}（${dates.length} 日, ≈${(dates.length / 252).toFixed(1)} 年）\n`);

  const N = MAG7.length;
  const priceMatrix: number[][] = dates.map((d) => MAG7.map((t) => px.get(t)!.get(d)!));

  const equalAt = () => MAG7.map(() => 1 / N);

  // 时变盈利权重：按当日 PIT 净利润占比（全亏则等权）。
  const niCache = new Map<string, number[]>();
  const niWeightAt = (t: number): number[] => {
    const d = dates[t];
    if (niCache.has(d)) return niCache.get(d)!;
    const nis = MAG7.map((tk) => pitNI(fundOf.get(tk)!.ni, d));
    const sum = nis.reduce((a, b) => a + b, 0);
    const w = sum > 0 ? nis.map((x) => x / sum) : equalAt();
    niCache.set(d, w);
    return w;
  };

  // E/P（盈利收益率）= PIT 净利 / 市值；市值 = 最新股本 × 后复权价（拆股一致）。
  // 在等权基础上按 E/P 的截面 z 分做指数倾斜：w ∝ exp(k·z)。k=0→等权；k 越大越偏向「便宜又赚钱」。
  const epAt = (t: number): number[] => {
    const d = dates[t];
    const eps = MAG7.map((tk, i) => {
      const f = fundOf.get(tk)!;
      const mcap = f.shares * priceMatrix[t][i];
      return mcap > 0 ? pitNI(f.ni, d) / mcap : 0; // 亏损已被 pitNI 置 0
    });
    return eps;
  };
  const epTiltAt = (k: number) => (t: number): number[] => {
    const eps = epAt(t);
    const mean = eps.reduce((a, b) => a + b, 0) / N;
    const sd = Math.sqrt(eps.reduce((a, b) => a + (b - mean) ** 2, 0) / N) || 1e-9;
    const raw = eps.map((e) => Math.exp((k * (e - mean)) / sd));
    const sum = raw.reduce((a, b) => a + b, 0);
    return raw.map((x) => x / sum);
  };

  const results: Metrics[] = [];

  // 基准
  results.push(metricsOf("买入持有·等权", simulate(priceMatrix, equalAt, () => false, 0).equity, 0));
  for (const b of BENCH) results.push(metricsOf(`${b} 买入持有`, singleAsset(dates.map((d) => px.get(b)!.get(d)!)), 0));
  results.push(metricsOf("对照·等权再平衡每季", simulate(priceMatrix, equalAt, (t) => t % 63 === 0, 0).equity, simulate(priceMatrix, equalAt, (t) => t % 63 === 0, 0).turnoverPerYr));
  results.push(metricsOf("对照·盈利权重再平衡每季", simulate(priceMatrix, niWeightAt, (t) => t % 63 === 0, 0).equity, simulate(priceMatrix, niWeightAt, (t) => t % 63 === 0, 0).turnoverPerYr));

  // ★ E/P 倾斜 + 再平衡（本轮主角）：温和(k=1) / 较强(k=2)，季度再平衡
  for (const k of [1, 2]) {
    const s = simulate(priceMatrix, epTiltAt(k), (t) => t % 63 === 0, 0);
    results.push(metricsOf(`E/P倾斜k=${k}·再平衡每季`, s.equity, s.turnoverPerYr));
  }
  // E/P 倾斜 k=1 的 买入持有 / 年度 / 含成本 对照
  results.push(metricsOf("E/P倾斜k=1·买入持有", simulate(priceMatrix, epTiltAt(1), () => false, 0).equity, 0));
  const epYr = simulate(priceMatrix, epTiltAt(1), (t) => t % 252 === 0, 0);
  results.push(metricsOf("E/P倾斜k=1·再平衡每年", epYr.equity, epYr.turnoverPerYr));
  const epCost = simulate(priceMatrix, epTiltAt(1), (t) => t % 63 === 0, TX_BPS);
  results.push(metricsOf(`E/P倾斜k=1·每季(含${TX_BPS}bp)`, epCost.equity, epCost.turnoverPerYr));

  // 单票参照
  results.push(metricsOf("NVDA 单票(事后赢家)", singleAsset(dates.map((d) => px.get("NVDA")!.get(d)!)), 0));

  // 打印
  const pct = (x: number) => (x * 100).toFixed(1).padStart(8) + "%";
  console.log("策略".padEnd(32) + "总收益".padStart(11) + "CAGR".padStart(10) + "年化波动".padStart(11) + "夏普".padStart(8) + "最大回撤".padStart(11) + "年换手".padStart(9));
  console.log("-".repeat(100));
  for (const m of results) {
    console.log(
      m.name.padEnd(30) + pct(m.totalRet) + pct(m.cagr) + pct(m.vol) + m.sharpe.toFixed(2).padStart(8) + pct(m.maxDD) +
        (m.turnoverPerYr ? m.turnoverPerYr.toFixed(2) + "x" : "—").padStart(9),
    );
  }
  console.log("\n注：样本=七姐妹缓存可得 5 只（缺 AMZN/META）+ SPY；复权总收益, rf=0；盈利权重=PIT 年度净利占比, 亏损置0。");
  console.log("⚠ 幸存者偏差：这是事后赢家，真实操作中当年并不知道；「赢家跌了补仓」只在它们持续是赢家时成立。");
}

main();
