/**
 * 估值多模型库的自检：跑一遍 valuation.json 里每家公司，打印五模型结论 + 综合，
 * 并对 DCF / 反推 DCF 的数值做几条不变量断言（防止重构把公式改错）。
 *
 * 用法：pnpm exec tsx scripts/test-valuation.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { evaluate, intrinsicValueB, impliedGrowthPct, VERDICT_LABEL, type ValuationInput } from "../src/lib/valuation/models";

const data = JSON.parse(readFileSync(join(process.cwd(), "src/lib/data/valuation.json"), "utf8")) as {
  companies: ValuationInput[];
};

let failures = 0;
const assert = (cond: boolean, msg: string) => {
  if (!cond) {
    failures++;
    console.error(`  ✗ ${msg}`);
  }
};

// 单调性不变量：增速越高内在价值越大；折现率越高内在价值越小。
{
  const lo = intrinsicValueB(70, 10, 9, 4, 40);
  const hi = intrinsicValueB(70, 14, 9, 4, 40);
  assert(hi > lo, `增速↑应使内在价值↑（10%→${lo.toFixed(0)} / 14%→${hi.toFixed(0)}）`);
  const cheapR = intrinsicValueB(70, 12, 8, 4, 40);
  const dearR = intrinsicValueB(70, 12, 10, 4, 40);
  assert(cheapR > dearR, `折现率↑应使内在价值↓（8%→${cheapR.toFixed(0)} / 10%→${dearR.toFixed(0)}）`);
}

for (const c of data.companies) {
  const res = evaluate(c);
  console.log(`\n=== ${c.ticker} ${c.name}（${c.asOf}）现价 $${c.price} 市值 $${(c.marketCapB / 1000).toFixed(2)}T ===`);
  for (const m of res.models) {
    console.log(`  [${VERDICT_LABEL[m.verdict].padEnd(3)}] ${m.label.padEnd(10)} ${m.detail}`);
  }
  console.log(`  → 综合：${res.overall.label}（score ${res.overall.score.toFixed(2)}）`);

  // 反推一致性：把隐含增速代回 DCF，应得到 ≈ 市值。
  const g = impliedGrowthPct(c);
  const back = intrinsicValueB(c.fcfBaseB, g, c.discountRatePct, c.terminalGrowthPct, c.netCashB);
  assert(Math.abs(back - c.marketCapB) < 1, `${c.ticker} 反推 DCF 应回到市值（得 ${back.toFixed(1)} vs ${c.marketCapB}）`);
  assert(res.models.length === 5, `${c.ticker} 应有 5 个模型`);
}

console.log(failures === 0 ? "\n✓ 全部断言通过" : `\n✗ ${failures} 条断言失败`);
process.exit(failures === 0 ? 0 : 1);
