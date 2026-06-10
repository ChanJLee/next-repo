/**
 * 从 EDGAR companyfacts 抽每家公司的财报申报日历（10-Q/10-K 的 filed 去重排序），
 * 作为 PEAD 事件日的代理（申报日 ≈ 财报披露日，对 63 日漂移研究是略保守的代理）。
 * 缓存到 data/earnings-dates.json，供 test-pead.ts 复用。
 * 用法：pnpm exec tsx scripts/build-earnings-dates.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { resolveCik, getCompanyFacts } from "../src/lib/data/edgar";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const uni = JSON.parse(readFileSync(join(process.cwd(), "data", "universe-candles.json"), "utf8")) as { candles: Record<string, unknown> };
  const symbols = Object.keys(uni.candles);
  const out: Record<string, string[]> = {};
  let ok = 0;
  for (const tk of symbols) {
    try {
      const cik = await resolveCik(tk);
      if (!cik) { console.log(`${tk}: 无 CIK（可能是 ETF/外国发行人），跳过`); continue; }
      await sleep(250);
      const facts = await getCompanyFacts(cik);
      const dates = new Set<string>();
      for (const tax of Object.values(facts.facts)) {
        for (const concept of Object.values(tax)) {
          for (const arr of Object.values(concept.units)) {
            for (const f of arr) if (/^10-[QK]/.test(f.form) && f.filed) dates.add(f.filed);
          }
        }
      }
      out[tk] = [...dates].sort();
      ok++;
      process.stdout.write(`\r[${tk}] ${out[tk].length} 个财报日  (${ok})        `);
      await sleep(250);
    } catch (e) {
      console.log(`\n${tk} 失败: ${e instanceof Error ? e.message : e}`);
    }
  }
  const path = join(process.cwd(), "data", "earnings-dates.json");
  writeFileSync(path, JSON.stringify({ createdAt: new Date().toISOString(), perSymbol: Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.length])), dates: out }));
  console.log(`\n写入 ${path}：${ok} 标的`);
}
main();
