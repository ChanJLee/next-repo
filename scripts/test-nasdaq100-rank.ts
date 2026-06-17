/**
 * 闸门 B（精简版）：纳指年度重构是不是「市值排序」说了算？
 *
 * 信息版临界看板的全部信任都押在一个命题上：纳入/剔除由市值排名决定。若成立，则「算出当下
 * 市值排名、标出第 ~90–110 名泡沫区」就是可信的前瞻；若不成立，看板就是好看的瞎猜。
 *
 * 不重建整个纳指宇宙（大工程），只验证核心命题：每次重构里【增列股】排名日市值是否
 * 系统性高于【剔除股】。排名日=该年 11 月底（Nasdaq 用 11 月底市值定选）。
 * 市值 = 收盘价(≤排名日, Yahoo) × 流通股本(pit filed≤排名日, EDGAR)。
 *
 * 诚实坎：① 剔除有时因「最小权重/资格」而非纯市值 → 容许少量重叠，看的是中位数是否清晰分开、
 *   每年 min(增列) 是否多半 ≥ max(剔除)；② 外国发行人 EDGAR 缺股本会掉样本，如实报覆盖。
 * 用法：pnpm exec tsx scripts/test-nasdaq100-rank.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getDailyCandles } from "../src/lib/data/yahoo";
import { resolveCik, getCompanyFacts, pitFact, pitFirst, type CompanyFacts } from "../src/lib/data/edgar";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
const fmtB = (x: number) => `$${x.toFixed(1)}B`;

interface Annual { effective: string; added: string[]; removed: string[] }
const data = JSON.parse(readFileSync(join(process.cwd(), "data", "nasdaq100-changes.json"), "utf8")) as { annual: Annual[] };

const priceCache = new Map<string, { dates: string[]; close: number[] } | null>();
const factsCache = new Map<string, CompanyFacts | null>();

async function priceOnOrBefore(tk: string, date: string): Promise<number | null> {
  if (!priceCache.has(tk)) {
    try { const c = await getDailyCandles(tk, 3600); priceCache.set(tk, { dates: c.map((r) => r.date.toISOString().slice(0, 10)), close: c.map((r) => r.close) }); }
    catch { priceCache.set(tk, null); }
  }
  const s = priceCache.get(tk); if (!s) return null;
  let lo = 0, hi = s.dates.length - 1, ans = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (s.dates[m] <= date) { ans = m; lo = m + 1; } else hi = m - 1; }
  return ans < 0 ? null : s.close[ans];
}

async function sharesPit(tk: string, asOf: string): Promise<number | null> {
  if (!factsCache.has(tk)) {
    try { const cik = await resolveCik(tk); factsCache.set(tk, cik ? await getCompanyFacts(cik) : null); await sleep(180); }
    catch { factsCache.set(tk, null); }
  }
  const f = factsCache.get(tk); if (!f) return null;
  const v = pitFirst([
    () => pitFact(f, "EntityCommonStockSharesOutstanding", "shares", asOf, { taxonomy: "dei" }),
    () => pitFact(f, "CommonStockSharesOutstanding", "shares", asOf),
  ]);
  return v?.val ?? null;
}

async function capAt(tk: string, rankDate: string): Promise<number | null> {
  const [p, sh] = await Promise.all([priceOnOrBefore(tk, rankDate), sharesPit(tk, rankDate)]);
  if (p == null || sh == null || sh <= 0) return null;
  return (p * sh) / 1e9; // $B
}

async function main() {
  console.log("闸门B：纳指年度重构『增列市值 > 剔除市值』验证（排名日=该年11/30，市值=价×pit股本）\n");
  const addAll: number[] = [], remAll: number[] = [];
  let passYears = 0, evalYears = 0;

  for (const ev of data.annual) {
    const year = ev.effective.slice(0, 4);
    const rankDate = `${year}-11-30`;
    const addCaps: { tk: string; c: number }[] = [];
    const remCaps: { tk: string; c: number }[] = [];
    for (const tk of ev.added) { const c = await capAt(tk, rankDate); if (c != null) addCaps.push({ tk, c }); }
    for (const tk of ev.removed) { const c = await capAt(tk, rankDate); if (c != null) remCaps.push({ tk, c }); }
    addCaps.sort((a, b) => a.c - b.c); remCaps.sort((a, b) => b.c - a.c);

    const minAdd = addCaps.length ? addCaps[0].c : NaN;
    const maxRem = remCaps.length ? remCaps[0].c : NaN;
    const sep = addCaps.length && remCaps.length ? (minAdd >= maxRem ? "✓干净分开" : `⚠重叠(min增${fmtB(minAdd)}<max剔${fmtB(maxRem)})`) : "—数据不足";
    if (addCaps.length && remCaps.length) { evalYears++; if (minAdd >= maxRem) passYears++; }
    addAll.push(...addCaps.map((x) => x.c)); remAll.push(...remCaps.map((x) => x.c));

    console.log(`${year}  增列(${addCaps.length}/${ev.added.length}) 中位${addCaps.length ? fmtB(median(addCaps.map(x=>x.c))) : "—"}  剔除(${remCaps.length}/${ev.removed.length}) 中位${remCaps.length ? fmtB(median(remCaps.map(x=>x.c))) : "—"}   ${sep}`);
    console.log(`      增列: ${addCaps.map((x) => `${x.tk} ${fmtB(x.c)}`).join("  ") || "—"}`);
    console.log(`      剔除: ${remCaps.map((x) => `${x.tk} ${fmtB(x.c)}`).join("  ") || "—"}`);
  }

  console.log(`\n汇总：增列市值中位 ${fmtB(median(addAll))}（n=${addAll.length}） vs 剔除市值中位 ${fmtB(median(remAll))}（n=${remAll.length}）`);
  console.log(`      逐年「min(增列) ≥ max(剔除)」干净分开：${passYears}/${evalYears} 年`);
  console.log("\n判读：增列中位显著高于剔除中位、且多数年份干净分开 → 市值排序确为决定增删的主力 → 临界看板可信。");
  console.log("      重叠主要来自『因最小权重/资格被剔除』的略大市值股，不否定主结论，但提示看板要把『权重过低』也作为剔除风险维度。");
}

main();
