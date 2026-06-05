/**
 * EDGAR 地基验证：证明能拿到真·point-in-time 基本面。
 *   1) ticker → CIK 解析
 *   2) 拉 company facts，打印 StockholdersEquity（账面权益）最近几期的 end/filed/form/val
 *   3) PIT 查询示范：分别"截至若干历史日"，看当时能看到的最新账面权益是哪一期、何时申报的
 *      —— 验证 filed ≤ asOf 的约束确实挡住了未来数据。
 *
 * 用法：pnpm exec tsx scripts/edgar-probe.ts [ticker=AAPL]
 *   首次会拉 ~10MB 的 company_tickers + 各标的 facts，注意 SEC 限流（脚本已 sleep）。
 */
import { resolveCik, getCompanyFacts, factSeries, pitFact } from "../src/lib/data/edgar";

const TICKERS = process.argv.slice(2).length ? process.argv.slice(2) : ["AAPL", "KO", "XOM"];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ASOFS = ["2018-06-30", "2020-06-30", "2022-06-30", "2024-06-30"];

async function main() {
  for (const tk of TICKERS) {
    const cik = await resolveCik(tk);
    if (!cik) { console.log(`\n${tk}: 未找到 CIK（可能非美股/ETF）`); continue; }
    await sleep(300);
    const facts = await getCompanyFacts(cik);
    const se = factSeries(facts, "StockholdersEquity", "USD");
    console.log(`\n=== ${tk}  CIK=${cik}  ${facts.entityName} ===`);
    console.log(`StockholdersEquity（账面权益）共 ${se.length} 条事实，最近 5 条：`);
    for (const f of se.slice(-5)) {
      console.log(`  end=${f.end}  filed=${f.filed}  ${f.form}  val=${(f.val / 1e9).toFixed(2)}B`);
    }
    console.log("PIT 查询（截至某日，能看到的最新账面权益）：");
    for (const asOf of ASOFS) {
      const f = pitFact(facts, "StockholdersEquity", "USD", asOf);
      if (f) console.log(`  截至 ${asOf} → 期末 ${f.end}（${f.filed} 申报，${f.form}）= ${(f.val / 1e9).toFixed(2)}B`);
      else console.log(`  截至 ${asOf} → 无（当时尚无已申报数据）`);
    }
    await sleep(400);
  }
  console.log("\n✅ 若每个'截至 D'看到的 filed 都 ≤ D，则 point-in-time 约束成立、无未来函数。");
}

main();
