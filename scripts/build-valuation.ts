/**
 * 刷新估值快照里随行情每日变动的输入（离线，收盘后重跑提交）。
 *
 * 只刷新「市场驱动」的三个字段，其余基本面（增速 / 历史 PE 锚 / 正常化 FCF / 净现金
 * / DCF 假设）按季度人工维护、本脚本一律不动：
 *   · price        ← Yahoo regularMarketPrice（现价）
 *   · marketCapB   ← Yahoo marketCap / 1e9（市值，十亿美元）
 *   · forwardEps   ← Yahoo epsForward（下一财年共识 EPS）
 *
 * 护栏：某只票查不到有效报价 → 保留其旧值、且不更新它的 asOf（保持可见的「陈旧」状态），
 * 仅打印告警；若【全部】票都查不到（疑似数据源宕机）→ 非零退出、不写文件，避免提交坏快照。
 *
 * 用法：pnpm exec tsx scripts/build-valuation.ts  /  pnpm valuation:refresh
 */
import { writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YahooFinance from "yahoo-finance2";

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey", "ripHistorical"] });

interface Company {
  ticker: string;
  name: string;
  asOf: string;
  price: number;
  marketCapB: number;
  forwardEps: number;
  [k: string]: unknown; // 其余人工维护字段原样保留
}

interface Quote { price: number; capB: number; eps?: number }

async function fetchQuotes(tickers: string[]): Promise<Map<string, Quote>> {
  const out = new Map<string, Quote>();
  const raw = await yf.quote(tickers, {}, { validateResult: false });
  for (const q of Array.isArray(raw) ? raw : [raw]) {
    const sym = (q?.symbol as string | undefined)?.toUpperCase();
    const price = q?.regularMarketPrice as number | undefined;
    const cap = q?.marketCap as number | undefined;
    if (sym && typeof price === "number" && price > 0 && typeof cap === "number" && cap > 0) {
      out.set(sym, { price, capB: cap / 1e9, eps: typeof q?.epsForward === "number" ? (q.epsForward as number) : undefined });
    }
  }
  return out;
}

async function main() {
  const outPath = join(process.cwd(), "src", "lib", "data", "valuation.json");
  const data = JSON.parse(readFileSync(outPath, "utf8")) as { note: string; companies: Company[] };
  const tickers = data.companies.map((c) => c.ticker.toUpperCase());
  console.log(`刷新行情字段（price / marketCapB / forwardEps）：${tickers.join(", ")}`);

  const quotes = await fetchQuotes(tickers);
  const asOf = new Date().toISOString().slice(0, 10);

  let refreshed = 0;
  for (const c of data.companies) {
    const q = quotes.get(c.ticker.toUpperCase());
    if (!q) {
      console.log(`  ⚠ ${c.ticker} 无有效报价，保留旧值（asOf ${c.asOf} 不变）`);
      continue;
    }
    const price = +q.price.toFixed(2);
    const capB = Math.round(q.capB);
    const eps = q.eps !== undefined ? +q.eps.toFixed(2) : c.forwardEps; // 没有共识 EPS 就保留人工值
    console.log(
      `  ✓ ${c.ticker} 价 $${c.price}→$${price} · 市值 $${c.marketCapB}B→$${capB}B · 远期EPS ${c.forwardEps}→${eps}`,
    );
    c.price = price;
    c.marketCapB = capB;
    c.forwardEps = eps;
    c.asOf = asOf;
    refreshed++;
  }

  if (refreshed === 0) {
    console.error("没有任何票刷新成功，疑似数据源异常，终止不写（保留上次好数据）");
    process.exit(1);
  }

  writeFileSync(outPath, JSON.stringify(data, null, 2) + "\n");
  console.log(`\n已刷新 ${refreshed}/${data.companies.length} 只，写入 ${outPath}`);
}

main();
