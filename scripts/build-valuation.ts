/**
 * 刷新估值快照里能从行情/财报自动取到的输入（离线，收盘后重跑提交）。
 *
 * 字段分三类：
 *  ① 自动刷新（AUTO_FIELDS，从 Yahoo 取）：
 *     · price        ← regularMarketPrice（现价）
 *     · marketCapB   ← marketCap / 1e9（市值，十亿美元）
 *     · forwardEps   ← epsForward（下一财年共识 EPS）
 *     · netCashB     ← (totalCash − totalDebt) / 1e9（净现金，可为负=净负债，事实值）
 *     · consensusGrowthPct ← earningsTrend「+1y」growth ×100（明年共识增速；近似长期增速）
 *     · fcfBaseB     ← freeCashflow / 1e9（TTM 自由现金流，作为「正常化」的初值近似）
 *  ② 数据源给不了，永远人工：hist5yForwardPe（无历史远期 PE 序列）。
 *  ③ 建模假设，按设计人工：stage1GrowthPct / discountRatePct / terminalGrowthPct。
 *
 * 字段级锁：每家公司可选 "manualFields": ["fcfBaseB", ...]，其中列到的 AUTO_FIELDS
 * 一律不被覆盖（用于钉住你已校准的判断值，如 MSFT/GOOGL 的增速与正常化 FCF）。
 * ② ③ 类字段本就不在 AUTO_FIELDS 里，天然不会被动。
 *
 * 护栏：某字段取不到有效值 → 保留旧值；某只票一个字段都没刷到 → 不动它、不改其 asOf；
 * 若【全部】票都没刷到（疑似数据源宕机）→ 非零退出、不写文件，避免提交坏快照。
 *
 * 用法：pnpm exec tsx scripts/build-valuation.ts  /  pnpm valuation:refresh
 */
import { writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YahooFinance from "yahoo-finance2";

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey", "ripHistorical"] });

// 仅这些字段会被自动刷新；其余字段（hist5yForwardPe / DCF 假设）脚本一律不碰。
const AUTO_FIELDS = ["price", "marketCapB", "forwardEps", "netCashB", "consensusGrowthPct", "fcfBaseB"] as const;
type AutoField = (typeof AUTO_FIELDS)[number];

interface Company {
  ticker: string;
  name: string;
  asOf: string;
  manualFields?: string[]; // 列到的 AUTO_FIELDS 不被覆盖（钉住人工校准值）
  [k: string]: unknown;
}

// 每只票从 Yahoo 算出的候选自动值（仅含取到有效值的字段）
type Candidates = Partial<Record<AutoField, number>>;

const num = (x: unknown): number | undefined => (typeof x === "number" && Number.isFinite(x) ? x : undefined);

async function fetchCandidates(ticker: string): Promise<Candidates> {
  const out: Candidates = {};
  // 报价：price / marketCap / epsForward
  try {
    const raw = await yf.quote(ticker, {}, { validateResult: false });
    const q = Array.isArray(raw) ? raw[0] : raw;
    const price = num(q?.regularMarketPrice);
    const cap = num(q?.marketCap);
    const eps = num(q?.epsForward);
    if (price !== undefined && price > 0) out.price = +price.toFixed(2);
    if (cap !== undefined && cap > 0) out.marketCapB = Math.round(cap / 1e9);
    if (eps !== undefined) out.forwardEps = +eps.toFixed(2);
  } catch { /* 报价取不到就略过这几项 */ }

  // 基本面：净现金 / 共识增速 / TTM 自由现金流
  try {
    const r = (await yf.quoteSummary(ticker, { modules: ["financialData", "earningsTrend"] }, { validateResult: false })) as {
      financialData?: { totalCash?: number; totalDebt?: number; freeCashflow?: number };
      earningsTrend?: { trend?: { period?: string; growth?: number }[] };
    };
    const fd = r.financialData ?? {};
    const cash = num(fd.totalCash);
    const debt = num(fd.totalDebt);
    if (cash !== undefined && debt !== undefined) out.netCashB = Math.round((cash - debt) / 1e9);
    const fcf = num(fd.freeCashflow);
    if (fcf !== undefined) out.fcfBaseB = Math.round(fcf / 1e9);
    const next = (r.earningsTrend?.trend ?? []).find((t) => t.period === "+1y");
    const g = num(next?.growth);
    if (g !== undefined) out.consensusGrowthPct = +(g * 100).toFixed(1);
  } catch { /* 基本面取不到就保留人工值 */ }

  return out;
}

async function main() {
  const outPath = join(process.cwd(), "src", "lib", "data", "valuation.json");
  const data = JSON.parse(readFileSync(outPath, "utf8")) as { note: string; companies: Company[] };
  const asOf = new Date().toISOString().slice(0, 10);
  console.log(`刷新自动字段（${AUTO_FIELDS.join(" / ")}）：${data.companies.map((c) => c.ticker).join(", ")}`);

  let anyRefreshed = false;
  for (const c of data.companies) {
    const locked = new Set(c.manualFields ?? []);
    const cand = await fetchCandidates(c.ticker);
    const changes: string[] = [];
    for (const f of AUTO_FIELDS) {
      const v = cand[f];
      if (v === undefined) continue; // 没取到 → 保留旧值
      if (locked.has(f)) continue; // 人工锁定 → 不覆盖
      const old = c[f] as number;
      if (old !== v) changes.push(`${f} ${old}→${v}`);
      c[f] = v;
    }
    const got = AUTO_FIELDS.filter((f) => cand[f] !== undefined && !locked.has(f)).length;
    if (got === 0) {
      console.log(`  ⚠ ${c.ticker} 无有效自动值（或全锁定），保留旧值，asOf ${c.asOf} 不变`);
      continue;
    }
    c.asOf = asOf;
    anyRefreshed = true;
    const lockNote = locked.size ? `（锁定 ${[...locked].join(",")}）` : "";
    console.log(`  ✓ ${c.ticker}${lockNote} ${changes.length ? changes.join(" · ") : "无数值变化"}`);
    await new Promise((res) => setTimeout(res, 150)); // 轻微限速，别打爆 Yahoo
  }

  if (!anyRefreshed) {
    console.error("没有任何票刷新成功，疑似数据源异常，终止不写（保留上次好数据）");
    process.exit(1);
  }

  writeFileSync(outPath, JSON.stringify(data, null, 2) + "\n");
  console.log(`\n写入 ${outPath}`);
}

main();
