/**
 * 闸门 A：纳斯达克 100「被纳入」事件桌上到底有没有钱（事后全知上界）。
 *
 * 用历史真实【年度 12 月重构】增列名单（data/nasdaq100-changes.json，已开天眼知道谁会进），
 * 量埋伏窗口（生效前 N 个交易日 → 生效日）相对 QQQ 的超额收益。这是策略收益的【上界】：
 * 真实策略还要先把名单预测对（闸门 B），会再打折扣。若连开天眼都赚不到，整件事直接毙。
 *
 * 诚实坎：① 这些股是因当年涨疯了市值才挤进前 100 → 本就是强动量股，故一律扣 QQQ 基准，
 *   只认「超额」；② 同一年的增列高度相关 → 块自助按【年】重采样，不按个股，否则 CI 假窄；
 *   ③ 另测生效日→后 20 日漂移，验证「bump 不持续」（Morningstar/Greenwood-Sammon）。
 *
 * 三视角：埋伏窗口超额收益分布 / 公告附近(最后5日)是否已被抢跑 / 生效后漂移。
 * 用法：pnpm exec tsx scripts/test-nasdaq100-inclusion.ts [B=5000] [seed=1]
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getDailyCandles } from "../src/lib/data/yahoo";
import { mulberry32 } from "./_fitlib";

const B = Number(process.argv[2] ?? 5000);
const SEED = Number(process.argv[3] ?? 1);
const LOOKBACK_DAYS = 3400; // 一次拉到 ~2013，覆盖 2016 起所有事件

const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const fmtP = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(2)}%`;
const pct = (arr: number[], q: number) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1))))]; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Annual { effective: string; added: string[]; removed: string[] }
const data = JSON.parse(readFileSync(join(process.cwd(), "data", "nasdaq100-changes.json"), "utf8")) as { annual: Annual[] };

// 埋伏窗口（生效前多少个交易日开始买，持有到生效日收盘）
const ENTRY = [60, 40, 20, 5];
const POST = 20; // 生效后持有交易日数（测漂移）

type Series = { dates: string[]; close: number[] };
async function fetchSeries(tk: string): Promise<Series | null> {
  try {
    const c = await getDailyCandles(tk, LOOKBACK_DAYS);
    if (c.length < 100) return null;
    return { dates: c.map((r) => r.date.toISOString().slice(0, 10)), close: c.map((r) => r.close) };
  } catch { return null; }
}

// 在 series 里找 <= target 的最近交易日下标
function idxOnOrBefore(s: Series, target: string): number {
  let lo = 0, hi = s.dates.length - 1, ans = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (s.dates[m] <= target) { ans = m; lo = m + 1; } else hi = m - 1; }
  return ans;
}
const ret = (s: Series, i: number, j: number) => (i < 0 || j < 0 || i >= s.close.length || j >= s.close.length || s.close[i] <= 0) ? null : s.close[j] / s.close[i] - 1;

async function main() {
  console.log(`闸门A：纳斯达克100年度重构增列「事后全知」超额收益  B=${B} seed=${SEED}`);
  const events = data.annual;
  const years = events.map((e) => e.effective.slice(0, 4));
  const allTks = [...new Set(events.flatMap((e) => e.added))];
  console.log(`年度重构 ${events.length} 次（${years[0]}~${years[years.length - 1]}），增列个股去重 ${allTks.length} 只\n`);

  // 拉 QQQ 与所有增列股
  process.stdout.write("拉取 QQQ ... ");
  const qqq = await fetchSeries("QQQ");
  if (!qqq) { console.log("失败，无法计算超额，终止"); return; }
  console.log(`${qqq.dates[0]}~${qqq.dates[qqq.dates.length - 1]} (${qqq.close.length})`);
  const series = new Map<string, Series>();
  for (const tk of allTks) {
    const s = await fetchSeries(tk);
    if (s) series.set(tk, s);
    process.stdout.write(`\r拉个股 ${series.size}/${allTks.length} (${tk}${s ? "" : " ✗"})        `);
    await sleep(120);
  }
  console.log(`\n覆盖 ${series.size}/${allTks.length} 只\n`);

  // 每个 (entry 窗口) → 每个增列事件的超额收益，按年分组
  interface Row { year: string; tk: string; eff: string; abn: number; raw: number; bench: number }
  const byWindow = new Map<number, Row[]>();
  const postRows: Row[] = [];
  let missCount = 0;

  for (const ev of events) {
    const y = ev.effective.slice(0, 4);
    const qe = idxOnOrBefore(qqq, ev.effective);
    for (const tk of ev.added) {
      const s = series.get(tk);
      if (!s) { missCount++; continue; }
      const se = idxOnOrBefore(s, ev.effective);
      if (se < 0 || qe < 0) { missCount++; continue; }
      for (const w of ENTRY) {
        const raw = ret(s, se - w, se), bench = ret(qqq, qe - w, qe);
        if (raw == null || bench == null) continue;
        (byWindow.get(w) ?? byWindow.set(w, []).get(w)!).push({ year: y, tk, eff: ev.effective, abn: raw - bench, raw, bench });
      }
      // 生效后漂移
      const praw = ret(s, se, se + POST), pbench = ret(qqq, qe, qe + POST);
      if (praw != null && pbench != null) postRows.push({ year: y, tk, eff: ev.effective, abn: praw - pbench, raw: praw, bench: pbench });
    }
  }

  // 按年分块自助：把「年」当不可分块，重采样 #年 个年份，池化其中所有 Row
  const rng = mulberry32(SEED);
  function yearBlockCI(rows: Row[], key: (r: Row) => number) {
    const byYear = new Map<string, number[]>();
    for (const r of rows) (byYear.get(r.year) ?? byYear.set(r.year, []).get(r.year)!).push(key(r));
    const ys = [...byYear.keys()];
    const out: number[] = [];
    for (let b = 0; b < B; b++) {
      const pool: number[] = [];
      for (let k = 0; k < ys.length; k++) pool.push(...byYear.get(ys[Math.floor(rng() * ys.length)])!);
      out.push(mean(pool));
    }
    return out;
  }

  console.log("── ① 埋伏窗口超额收益（事后全知；生效前 N 交易日买入→生效日收盘，扣 QQQ）──");
  console.log("   窗口   样本  平均超额   中位超额   超额>0率   年块自助95%CI            P(超额>0)  平均原始  平均QQQ");
  for (const w of ENTRY) {
    const rows = byWindow.get(w) ?? [];
    if (!rows.length) continue;
    const abn = rows.map((r) => r.abn);
    const ci = yearBlockCI(rows, (r) => r.abn);
    console.log(
      `   T-${String(w).padStart(2)}  ${String(rows.length).padStart(4)}  ${fmtP(mean(abn)).padStart(8)}  ${fmtP(median(abn)).padStart(8)}  ` +
      `${(abn.filter((x) => x > 0).length / abn.length * 100).toFixed(0).padStart(5)}%   ` +
      `[${fmtP(pct(ci, 0.025))},${fmtP(pct(ci, 0.975))}]`.padEnd(22) +
      `  ${(ci.filter((x) => x > 0).length / B * 100).toFixed(0).padStart(4)}%   ` +
      `${fmtP(mean(rows.map((r) => r.raw))).padStart(8)}  ${fmtP(mean(rows.map((r) => r.bench))).padStart(7)}`
    );
  }

  console.log("\n── ② 生效后 20 交易日漂移（验证『bump 不持续』；扣 QQQ）──");
  if (postRows.length) {
    const abn = postRows.map((r) => r.abn);
    const ci = yearBlockCI(postRows, (r) => r.abn);
    console.log(`   样本 ${postRows.length}  平均超额 ${fmtP(mean(abn))}  中位 ${fmtP(median(abn))}  >0率 ${(abn.filter((x) => x > 0).length / abn.length * 100).toFixed(0)}%  年块CI [${fmtP(pct(ci, 0.025))},${fmtP(pct(ci, 0.975))}]  P(>0) ${(ci.filter((x) => x > 0).length / B * 100).toFixed(0)}%`);
  }

  console.log("\n── ③ 逐年 T-20 埋伏窗口平均超额（看是否被少数年份/个股主导）──");
  const w20 = byWindow.get(20) ?? [];
  const yset = [...new Set(w20.map((r) => r.year))].sort();
  for (const y of yset) {
    const rs = w20.filter((r) => r.year === y);
    const top = [...rs].sort((a, b) => b.abn - a.abn);
    console.log(`   ${y}  n=${rs.length}  平均超额 ${fmtP(mean(rs.map((r) => r.abn))).padStart(8)}   最强 ${top[0].tk} ${fmtP(top[0].abn)}  最弱 ${top[top.length - 1].tk} ${fmtP(top[top.length - 1].abn)}`);
  }

  if (missCount) console.log(`\n（缺数据跳过 ${missCount} 个个股-事件）`);
  console.log("\n判读：①若 T-60/-40 超额 CI 明显排除 0 且 >0 率高 → 埋伏窗口有钱（上界）；T-5 接近 0 → 已被抢跑，看公告才动太晚。");
  console.log("      ②若生效后漂移≈0 或为负 → bump 不持续，必须卡在生效日前了结。③逐年别被一两个超级牛股撑起全部超额。");
  console.log("      记住这是开天眼上界，闸门 B（能否提前算出名单）必须再过，才谈得上真实可做。");
}

main();
