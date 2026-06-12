/**
 * 构建「价值+动量」横截面信号快照（离线，周期性重跑）。
 *
 * 把验证过的 z(B/M)+z(12-1动量) 算到当下：参考池（固定大盘 ∪ watchlist）每个标的的
 * point-in-time 账面权益/股本（EDGAR，filed≤今天）× 当前价 → B/M、动量 → 截面 z 组合 →
 * 百分位。写入 committed 的 src/lib/data/factor-snapshot.json，运行时只读、零外部依赖。
 *
 * 基本面季度才变、动量月度变 → 建议每周重跑一次提交。
 * 用法：pnpm exec tsx scripts/build-factor-snapshot.ts
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "../src/lib/db";
import { resolveCik, getCompanyFacts, pitFact, pitFirst } from "../src/lib/data/edgar";
import { getDailyCandles } from "../src/lib/data/yahoo";

const FORM_LONG = 252, FORM_SKIP = 21, MIN_BARS = 300;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const REFERENCE = [
  "AAPL","MSFT","NVDA","GOOGL","META","AMZN","AVGO","ORCL","CSCO","ADBE","CRM","INTC","AMD","QCOM","TXN","IBM",
  "JPM","BAC","WFC","C","GS","MS","AXP","BLK",
  "JNJ","UNH","PFE","MRK","ABBV","TMO","ABT","LLY",
  "KO","PG","WMT","PEP","MCD","NKE","COST","HD","LOW","DIS",
  "CAT","GE","HON","UPS","BA","MMM","XOM","CVX","COP","T","VZ",
  "TSLA",
];

async function main() {
  const today = new Date().toISOString().slice(0, 10);
  // watchlist 标的并入参考池；CI 无库时优雅降级为仅参考池。
  let wlTickers: string[] = [];
  try {
    const wl = await prisma.symbol.findMany({ select: { ticker: true } });
    wlTickers = wl.map((s) => s.ticker.toUpperCase());
  } catch (e) {
    console.log(`DB 不可用（仅用参考池）：${e instanceof Error ? e.message : e}`);
  }
  const universe = [...new Set([...REFERENCE, ...wlTickers])];
  console.log(`参考池 ${universe.length} 个（含 watchlist ${wlTickers.length}），asOf=${today}`);

  const raw: { ticker: string; bm: number | null; mom: number | null }[] = [];
  for (const tk of universe) {
    try {
      const candles = await getDailyCandles(tk, 2000); // ~5.5 年，足够 252 日动量 + 余量（Stooq 已被反爬挡死，改用 Yahoo）
      if (candles.length < MIN_BARS) { raw.push({ ticker: tk, bm: null, mom: null }); continue; }
      const i = candles.length - 1;
      const price = candles[i].close;
      const mom = candles[i - FORM_LONG]?.close > 0 ? candles[i - FORM_SKIP].close / candles[i - FORM_LONG].close - 1 : null;
      let bm: number | null = null;
      const cik = await resolveCik(tk);
      if (cik) {
        await sleep(200);
        const facts = await getCompanyFacts(cik);
        const book = pitFact(facts, "StockholdersEquity", "USD", today)?.val;
        const shares = pitFirst([
          () => pitFact(facts, "EntityCommonStockSharesOutstanding", "shares", today, { taxonomy: "dei" }),
          () => pitFact(facts, "CommonStockSharesOutstanding", "shares", today),
        ])?.val;
        if (book != null && shares && shares > 0) bm = book / (price * shares);
      }
      raw.push({ ticker: tk, bm, mom });
      process.stdout.write(`\r[${tk}] bm=${bm?.toFixed(2) ?? "—"} mom=${mom != null ? (mom * 100).toFixed(0) + "%" : "—"}   `);
      await sleep(150);
    } catch (e) {
      console.log(`\n${tk} 失败: ${e instanceof Error ? e.message : e}`);
      raw.push({ ticker: tk, bm: null, mom: null });
    }
  }

  // 截面 z-score（仅用两因子都有值的标的定义均值/方差）
  const both = raw.filter((r) => r.bm != null && r.mom != null);
  const zstat = (vals: number[]) => { const m = vals.reduce((a, b) => a + b, 0) / vals.length; const sd = Math.sqrt(vals.reduce((a, b) => a + (b - m) ** 2, 0) / vals.length) || 1; return { m, sd }; };
  const bmS = zstat(both.map((r) => r.bm!)), momS = zstat(both.map((r) => r.mom!));
  const scored = both.map((r) => ({
    ticker: r.ticker,
    bm: +r.bm!.toFixed(4),
    mom: +r.mom!.toFixed(4),
    composite: +(((r.bm! - bmS.m) / bmS.sd) + ((r.mom! - momS.m) / momS.sd)).toFixed(4),
  }));
  scored.sort((a, b) => a.composite - b.composite);
  const N = scored.length;

  // 护栏：数据源若挂了（如价格全拉失败）会得到空/极小截面——绝不能静默提交空快照覆盖好数据。
  // 这是上次 Stooq 被反爬挡死后 cron 静默写入 0 条目的根因；这里直接非零退出让 CI 失败、不提交。
  const MIN_VALID = 30; // 参考池 ~52，健康运行应有 ~50；低于此判定数据源异常
  if (N < MIN_VALID) {
    console.error(`\n❌ 仅 ${N} 个标的有效（< ${MIN_VALID}），疑似价格/基本面数据源异常，拒绝写入空快照。`);
    await prisma.$disconnect().catch(() => {});
    process.exit(1);
  }

  const items = scored.map((s, rank) => ({ ...s, percentile: Math.round((rank / (N - 1)) * 100) }));

  const out = {
    asOf: today,
    builtAt: new Date().toISOString(),
    factor: "value+momentum (z(B/M)+z(12-1 mom))",
    universeSize: N,
    stats: { bmMean: +bmS.m.toFixed(4), bmStd: +bmS.sd.toFixed(4), momMean: +momS.m.toFixed(4), momStd: +momS.sd.toFixed(4) },
    items,
  };
  const path = join(process.cwd(), "src", "lib", "data", "factor-snapshot.json");
  writeFileSync(path, JSON.stringify(out, null, 2));
  console.log(`\n写入 ${path}：${N} 标的有效（共 ${universe.length}）`);
  console.log(`最便宜+最强动量 Top5: ${items.slice(-5).reverse().map((x) => `${x.ticker}(${x.percentile})`).join(", ")}`);
  console.log(`最贵+最弱 Bottom5: ${items.slice(0, 5).map((x) => `${x.ticker}(${x.percentile})`).join(", ")}`);
  await prisma.$disconnect().catch(() => {});
}

main();
