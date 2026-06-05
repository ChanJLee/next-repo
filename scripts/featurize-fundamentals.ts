/**
 * 基本面因子特征化（point-in-time）：SEC EDGAR 财报 × Stooq 价格 → 横截面价值/质量因子。
 *
 * 每个取样日 d、每个标的，按 filed ≤ d 取最新基本面（杜绝未来函数），结合当日价：
 *   · bm  = 账面权益 / 市值      （价值；高=便宜）
 *   · ep  = 年度净利 / 市值      （盈利收益率；高=便宜）
 *   · roe = 年度净利 / 账面权益    （质量）
 *   · gpa = 年度毛利 / 总资产      （Novy-Marx 质量）
 *   · mom = 12−1 月动量          （价量对照/组合用）
 * 标签留 fwd（未来 H 日收益），交给 test-fund-factors 做截面 rank + 按日期分块 CI。
 *
 * 用法：pnpm exec tsx scripts/featurize-fundamentals.ts [取样日=500] [步长=10] [H=63] [out=fund-cache.json]
 *   慢（拉 ~50 家 companyfacts，各 5–30MB）；SEC 限流已 sleep。
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { resolveCik, getCompanyFacts, pitFact, pitAnnualFlow, pitFirst, type CompanyFacts } from "../src/lib/data/edgar";
import { getDailyCandlesFromStooq } from "../src/lib/data/stooq";
import type { Candle } from "../src/lib/data/yahoo";

const MAX_SAMPLE_DATES = Number(process.argv[2] ?? 500);
const STEP = Math.max(1, Number(process.argv[3] ?? 10));
const H = Number(process.argv[4] ?? 63);
const OUT_FILE = process.argv[5] ?? "fund-cache.json";
const FORM_LONG = 252, FORM_SKIP = 21, MIN_BARS = 320;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ~50 家流动性大盘，跨行业（个股；ETF 无基本面故不含）
const UNIVERSE = [
  "AAPL","MSFT","NVDA","GOOGL","META","AMZN","AVGO","ORCL","CSCO","ADBE","CRM","INTC","AMD","QCOM","TXN","IBM",
  "JPM","BAC","WFC","C","GS","MS","AXP","BLK",
  "JNJ","UNH","PFE","MRK","ABBV","TMO","ABT","LLY",
  "KO","PG","WMT","PEP","MCD","NKE","COST","HD","LOW","DIS",
  "CAT","GE","HON","UPS","BA","MMM","XOM","CVX","COP","T","VZ",
];

interface FundRow { sym: string; date: string; f: (number | null)[]; fwd: number }
const FACTORS = ["bm", "ep", "roe", "gpa", "mom"] as const;

function factorsAt(facts: CompanyFacts, asOf: string, price: number, c: Candle[], i: number): (number | null)[] {
  const shares = pitFirst([
    () => pitFact(facts, "EntityCommonStockSharesOutstanding", "shares", asOf, { taxonomy: "dei" }),
    () => pitFact(facts, "CommonStockSharesOutstanding", "shares", asOf),
  ])?.val;
  const book = pitFact(facts, "StockholdersEquity", "USD", asOf)?.val;
  const ni = pitAnnualFlow(facts, "NetIncomeLoss", "USD", asOf)?.val;
  const rev = pitFirst([
    () => pitAnnualFlow(facts, "Revenues", "USD", asOf),
    () => pitAnnualFlow(facts, "RevenueFromContractWithCustomerExcludingAssessedTax", "USD", asOf),
    () => pitAnnualFlow(facts, "SalesRevenueNet", "USD", asOf),
  ])?.val;
  const gp = pitFirst([
    () => pitAnnualFlow(facts, "GrossProfit", "USD", asOf),
    () => (rev != null ? ({ val: rev } as any) : null), // 无毛利则退化用营收占资产（弱代理）
  ])?.val;
  const assets = pitFact(facts, "Assets", "USD", asOf)?.val;
  const mcap = shares && shares > 0 ? price * shares : undefined;

  const bm = book != null && mcap ? book / mcap : null;
  const ep = ni != null && mcap ? ni / mcap : null;
  const roe = ni != null && book && book > 0 ? ni / book : null;
  const gpa = gp != null && assets && assets > 0 ? gp / assets : null;
  const mom = c[i - FORM_LONG]?.close > 0 ? c[i - FORM_SKIP].close / c[i - FORM_LONG].close - 1 : null;
  return [bm, ep, roe, gpa, mom];
}

async function main() {
  const t0 = Date.now();
  const rows: FundRow[] = [];
  const ok: string[] = [];
  // 先建取样日历（用 SPY 交易日做参照）
  const spy = await getDailyCandlesFromStooq("SPY", 99999);
  const cal = spy.map((c) => c.date.toISOString().slice(0, 10));
  const sampleDates = cal.slice(-MAX_SAMPLE_DATES * STEP).filter((_, k) => k % STEP === 0);
  console.log(`取样日 ${sampleDates.length} 个（${sampleDates[0]} ~ ${sampleDates[sampleDates.length - 1]}）  H=${H}`);

  for (const tk of UNIVERSE) {
    try {
      const cik = await resolveCik(tk);
      if (!cik) { console.log(`\n${tk}: 无 CIK，跳过`); continue; }
      await sleep(250);
      const facts = await getCompanyFacts(cik);
      const candles = await getDailyCandlesFromStooq(tk, 99999);
      if (candles.length < MIN_BARS) { console.log(`\n${tk}: K线不足`); continue; }
      const idxByDate = new Map<string, number>();
      candles.forEach((c, i) => idxByDate.set(c.date.toISOString().slice(0, 10), i));
      let n = 0;
      for (const d of sampleDates) {
        const i = idxByDate.get(d);
        if (i == null || i < FORM_LONG || i + H >= candles.length) continue;
        const f = factorsAt(facts, d, candles[i].close, candles, i);
        const fwd = candles[i].close > 0 ? candles[i + H].close / candles[i].close - 1 : 0;
        rows.push({ sym: tk, date: d, f, fwd });
        n++;
      }
      ok.push(tk);
      process.stdout.write(`\r[${tk}] ${n} 行  (${ok.length}/${UNIVERSE.length})        `);
      await sleep(250);
    } catch (e) {
      console.log(`\n${tk} 失败: ${e instanceof Error ? e.message : e}`);
    }
  }

  const out = { createdAt: new Date().toISOString(), horizon: H, factorNames: [...FACTORS], step: STEP, perSymbol: ok.length, rows };
  const path = join(process.cwd(), "data", OUT_FILE);
  writeFileSync(path, JSON.stringify(out));
  console.log(`\n写入 ${path}：${rows.length} 行，${ok.length} 标的，用时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main();
