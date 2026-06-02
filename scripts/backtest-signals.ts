/**
 * 量化止盈/买入触发信号的可靠度（走查、因果，无未来函数）。
 *
 * 数据源两种：
 *   · 默认：本地 DB 的标的（你的 watchlist）。
 *   · 传入 ticker 参数 或 --universe：从 Stooq 现拉一批「多样化标的池」（含下跌/震荡/板块ETF），
 *     用于检验信号是否只在牛市赢家股上失效、换样本能否翻盘。不写库、不污染 watchlist。
 *
 * 对每次「事件起点」统计其后 H 日实际表现，并和基准（所有交易日无条件前瞻）对比：
 *   卖出(止盈)可靠 = edge<0（信号后弱于基准）；买入可靠 = edge>0。诚实呈现，弱就显示弱。
 *
 * 用法：
 *   pnpm exec tsx scripts/backtest-signals.ts                 # 本地 DB 标的
 *   pnpm exec tsx scripts/backtest-signals.ts --universe      # 内置多样化标的池(Stooq)
 *   pnpm exec tsx scripts/backtest-signals.ts INTC T KO XLU   # 自定义标的池(Stooq)
 */
import { prisma } from "../src/lib/db";
import { getDailyCandlesFromStooq } from "../src/lib/data/stooq";
import { triggerEvents } from "../src/lib/signals/position";
import type { Candle } from "../src/lib/data/yahoo";

const HORIZONS = [5, 10, 20];
const MIN_BARS = 210;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 多样化标的池：下跌/掉队股 + 防御/震荡 + 周期 + 板块ETF + 少量赢家做对照
const UNIVERSE = [
  "INTC", "T", "WBA", "PFE", "PYPL", "DIS", "BABA", "VZ", "CSCO", "IBM", "NKE", "MMM", "KHC", "PARA",
  "KO", "PG", "JNJ", "WMT", "XLU", "XLP",
  "F", "GM", "BAC", "XOM", "GE", "C",
  "SPY", "QQQM", "IWM", "XLF", "XLE", "EEM",
  "AAPL", "MSFT", "NVDA", "GOOGL",
];

interface Agg { n: number; sumRet: number[]; up: number[] }

async function gather(): Promise<{ ticker: string; candles: Candle[] }[]> {
  const args = process.argv.slice(2);
  const useUniverse = args.includes("--universe");
  const tickers = args.filter((a) => !a.startsWith("--"));
  if (useUniverse || tickers.length > 0) {
    const list = tickers.length > 0 ? tickers : UNIVERSE;
    const out: { ticker: string; candles: Candle[] }[] = [];
    for (const t of list) {
      try {
        const candles = await getDailyCandlesFromStooq(t, 99999, process.env.STOOQ_APIKEY);
        if (candles.length >= MIN_BARS + 30) out.push({ ticker: t, candles });
        process.stdout.write(`\r拉取 ${t}: ${candles.length} 根   `);
      } catch (e) {
        console.log(`\n${t} 失败: ${e instanceof Error ? e.message : e}`);
      }
      await sleep(1200);
    }
    console.log(`\n标的池就绪：${out.length}/${list.length} 个`);
    return out;
  }
  const symbols = await prisma.symbol.findMany({ include: { candles: { orderBy: { date: "asc" } } } });
  return symbols.map((s) => ({ ticker: s.ticker, candles: s.candles.map((c) => ({ date: c.date, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume })) }));
}

async function main() {
  const datasets = await gather();
  const sig = new Map<string, Agg>();
  const titleOf = new Map<string, string>();
  const base = { n: 0, sumRet: HORIZONS.map(() => 0), up: HORIZONS.map(() => 0) };

  for (const { candles } of datasets) {
    const n = candles.length;
    if (n < MIN_BARS + Math.max(...HORIZONS) + 1) continue;
    const close = candles.map((c) => c.close);
    for (let i = MIN_BARS; i < n; i++) {
      HORIZONS.forEach((H, hi) => {
        if (i + H < n) { const r = close[i + H] / close[i] - 1; base.sumRet[hi] += r; base.up[hi] += r > 0 ? 1 : 0; if (hi === 0) base.n++; }
      });
    }
    for (const ev of triggerEvents(candles)) {
      const k = `${ev.side}:${ev.key}`;
      titleOf.set(k, ev.title);
      const a = sig.get(k) ?? { n: 0, sumRet: HORIZONS.map(() => 0), up: HORIZONS.map(() => 0) };
      HORIZONS.forEach((H, hi) => {
        if (ev.index + H < n) { const r = close[ev.index + H] / close[ev.index] - 1; a.sumRet[hi] += r; a.up[hi] += r > 0 ? 1 : 0; if (hi === 0) a.n++; }
      });
      sig.set(k, a);
    }
  }

  const pct = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(2)}%`;
  console.log(`\n标的数=${datasets.length}  基准（无条件前瞻，n≈${base.n}）：`);
  HORIZONS.forEach((H, hi) => console.log(`  ${H}日: 平均收益 ${pct(base.sumRet[hi] / base.n)}  上涨率 ${(base.up[hi] / base.n * 100).toFixed(1)}%`));

  for (const side of ["sell", "buy"] as const) {
    console.log(`\n========== ${side === "sell" ? "止盈(卖出)" : "买入"}信号 ==========`);
    for (const [k, a] of sig) {
      if (!k.startsWith(side + ":")) continue;
      console.log(`\n【${titleOf.get(k)}】 触发次数 n=${a.n}`);
      HORIZONS.forEach((H, hi) => {
        const sigRet = a.sumRet[hi] / a.n, sigUp = a.up[hi] / a.n;
        const baseRet = base.sumRet[hi] / base.n, baseUp = base.up[hi] / base.n;
        const edge = sigRet - baseRet;
        const good = side === "sell" ? edge < 0 : edge > 0;
        console.log(`  ${String(H).padStart(2)}日: 信号后 ${pct(sigRet)} (涨率 ${(sigUp * 100).toFixed(1)}%) | 基准 ${pct(baseRet)} (${(baseUp * 100).toFixed(1)}%) | edge ${pct(edge)} ${good ? "✓符合预期" : "✗反向"}`);
      });
    }
  }
  await prisma.$disconnect();
}

main();
