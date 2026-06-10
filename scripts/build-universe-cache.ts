/**
 * 把多样化标的池的全历史日线从 Yahoo 拉下来缓存到 data/universe-candles.json，
 * 供"事件→前瞻期望值"系列研究脚本复用（Stooq 已被 JS 反爬挡死，统一改用 Yahoo）。
 * 池子刻意多样化：输家/掉队 + 防御/震荡 + 周期 + 板块ETF + 少量赢家做对照，避免只在牛市赢家上自欺。
 * 用法：pnpm exec tsx scripts/build-universe-cache.ts
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDailyCandles } from "../src/lib/data/yahoo";

const UNIVERSE = [
  "INTC","T","WBA","PFE","PYPL","DIS","BABA","VZ","CSCO","IBM","NKE","MMM","KHC","PARA",
  "KO","PG","JNJ","WMT","XLU","XLP",
  "F","GM","BAC","XOM","GE","C",
  "SPY","QQQM","IWM","XLF","XLE","EEM",
  "AAPL","MSFT","NVDA","GOOGL","TSLA","MU","TSM","AMD","CRM","ADBE","ORCL","QCOM",
];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const out: Record<string, { date: string; open: number; high: number; low: number; close: number; volume: number }[]> = {};
  let ok = 0;
  for (const t of UNIVERSE) {
    try {
      const c = await getDailyCandles(t, 13000); // ~35 年
      if (c.length >= 400) { out[t] = c.map((x) => ({ date: x.date.toISOString().slice(0, 10), open: x.open, high: x.high, low: x.low, close: x.close, volume: x.volume })); ok++; }
      process.stdout.write(`\r[${t}] ${c.length} 根  (${ok}/${UNIVERSE.length})        `);
    } catch (e) {
      console.log(`\n${t} 失败: ${e instanceof Error ? e.message : e}`);
    }
    await sleep(700);
  }
  const path = join(process.cwd(), "data", "universe-candles.json");
  writeFileSync(path, JSON.stringify({ createdAt: new Date().toISOString(), perSymbol: Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.length])), candles: out }));
  console.log(`\n写入 ${path}：${ok} 标的`);
}
main();
