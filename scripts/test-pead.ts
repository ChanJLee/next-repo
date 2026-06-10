/**
 * PEAD（盈余公告后漂移）检验，价格跳空代理 —— 用户选定方向，套用"事件→前瞻期望值"框架。
 *
 * 假说（Bernard-Thomas 经典异象）：财报披露后，股价会朝"惊喜"方向【继续漂移】数周~数月。
 * 本仓库无分析师预期数据，故用【公告窗口的价格反应】当惊喜代理（市场自己定价的 surprise）：
 *   surprise = 财报日前后 3 日的市场调整收益（个股 3日收益 − SPY 3日收益）。
 *   正 surprise=好消息、负=坏消息。
 *
 * 检验（无未来函数）：事件日 = EDGAR 10-Q/10-K 申报日（≈披露日）。在公告窗口结束【之后】
 *   进场（next open），持有 H 日（可选 ATR 移动止损），记净收益。
 *   · 多腿：top 惊喜分位 → 期望应 > 随机；空腿：bottom 分位 → 期望应 < 随机（或反向做空为正）。
 *   · edge = 事件收益 − 同标的基准期望（减个股漂移）；按事件月份块自助 95% CI。
 *   · 真 PEAD 要求：高 surprise 组 edge 显著>0 且随 surprise 分位单调；多空 spread CI 排除 0。
 *
 * 用法：pnpm exec tsx scripts/test-pead.ts [H=63] [ATR止损=0=不止损] [B=2000] [块长=6] [seed=1]
 *   先跑 build-universe-cache.ts 和 build-earnings-dates.ts。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mulberry32 } from "./_fitlib";

const H = Number(process.argv[2] ?? 63);
const ATR_K = Number(process.argv[3] ?? 0); // 0 = 纯持有 H 天
const B = Number(process.argv[4] ?? 2000);
const BLOCK = Math.max(1, Number(process.argv[5] ?? 6));
const SEED = Number(process.argv[6] ?? 1);
const REACT = 3;   // 公告反应窗口（交易日）
const ENTRY_LAG = 2; // 公告日后第几根进场（避开当根，留给信息扩散）

interface C { date: string; open: number; high: number; low: number; close: number; volume: number }
const uni = JSON.parse(readFileSync(join(process.cwd(), "data", "universe-candles.json"), "utf8")) as { candles: Record<string, C[]> };
const earn = JSON.parse(readFileSync(join(process.cwd(), "data", "earnings-dates.json"), "utf8")) as { dates: Record<string, string[]> };

const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const pctl = (arr: number[], q: number) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1))))]; };
const fmtP = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(2)}%`;

function atr(c: C[], i: number, p = 14): number | null {
  if (i < p) return null; let s = 0;
  for (let j = i + 1 - p; j <= i; j++) { const tr = Math.max(c[j].high - c[j].low, Math.abs(c[j].high - c[j - 1].close), Math.abs(c[j].low - c[j - 1].close)); s += tr; }
  return s / p;
}
function tradeReturn(c: C[], entryIdx: number): number | null {
  if (entryIdx >= c.length || !(c[entryIdx].open > 0)) return null;
  const entry = c[entryIdx].open;
  const last = Math.min(c.length - 1, entryIdx + H - 1);
  if (ATR_K <= 0) return c[last].close / entry - 1;
  const a0 = atr(c, entryIdx - 1) ?? entry * 0.02;
  let peak = entry, stop = entry - ATR_K * a0;
  for (let j = entryIdx; j <= last; j++) {
    if (c[j].low <= stop) return stop / entry - 1;
    if (c[j].close > peak) { peak = c[j].close; const a = atr(c, j) ?? a0; stop = Math.max(stop, peak - ATR_K * a); }
  }
  return c[last].close / entry - 1;
}

function main() {
  const spy = uni.candles["SPY"];
  const spyIdx = new Map(spy.map((c, i) => [c.date, i]));
  const spyRet = (d0: string, n: number): number | null => { const i = spyIdx.get(d0); if (i == null || i + n >= spy.length) return null; return spy[i + n].close / spy[i].close - 1; };

  interface Ev { sym: string; month: string; surprise: number; r: number }
  const all: Ev[] = [];
  const baseBySym = new Map<string, number>();
  let symsUsed = 0;

  for (const [sym, c] of Object.entries(uni.candles)) {
    const eds = earn.dates[sym];
    if (!eds || eds.length < 8 || sym === "SPY") continue;
    const idxByDate = new Map(c.map((x, i) => [x.date, i]));
    // 基准期望：全可交易根（同 H、同止损规则）
    const rs: number[] = [];
    for (let i = 200; i + 1 < c.length; i++) { const r = tradeReturn(c, i + 1); if (r != null) rs.push(r); }
    if (rs.length < 50) continue;
    baseBySym.set(sym, mean(rs));
    symsUsed++;

    for (const ed of eds) {
      // 把申报日对齐到该股最近的交易日（≥ed 的第一根）
      let ei = idxByDate.get(ed);
      if (ei == null) { const f = c.findIndex((x) => x.date >= ed); if (f < 0) continue; ei = f; }
      if (ei < 200 || ei + REACT + ENTRY_LAG + H >= c.length) continue;
      // 惊喜代理 = 反应窗口内市场调整收益
      const react = c[ei + REACT].close / c[ei].close - 1;
      const mkt = spyRet(c[ei].date, REACT);
      if (mkt == null) continue;
      const surprise = react - mkt;
      const entryIdx = ei + REACT + ENTRY_LAG;
      const r = tradeReturn(c, entryIdx);
      if (r == null) continue;
      all.push({ sym, month: c[ei].date.slice(0, 7), surprise, r });
    }
  }
  console.log(`PEAD  标的=${symsUsed}  事件=${all.length}  H=${H}  止损=${ATR_K <= 0 ? "无" : ATR_K + "×ATR"}  反应窗口=${REACT}d  进场滞后=${ENTRY_LAG}  块长(月)=${BLOCK}`);
  if (all.length < 100) { console.log("事件太少。"); return; }

  // ① 惊喜五分位的减漂移 edge（看是否单调：好消息→正漂移、坏消息→负漂移）
  const sorted = [...all].sort((a, b) => a.surprise - b.surprise);
  const N = sorted.length;
  console.log("\n── ① 惊喜五分位（减个股漂移后的未来 H 日 edge；PEAD 应随惊喜单调上升）──");
  const qEdges: number[][] = [];
  for (let q = 0; q < 5; q++) {
    const part = sorted.slice(Math.floor(q * N / 5), Math.floor((q + 1) * N / 5));
    const edges = part.map((e) => e.r - (baseBySym.get(e.sym) ?? 0));
    qEdges.push(edges);
    console.log(`  Q${q + 1} surprise∈[${fmtP(part[0].surprise)},${fmtP(part[part.length - 1].surprise)}]  edge=${fmtP(mean(edges))}  原始=${fmtP(mean(part.map((e) => e.r)))}  (${part.length})`);
  }

  // ② 多空 spread（Q5−Q1）按事件月份块自助
  const rng = mulberry32(SEED);
  const byMonth = (evs: Ev[]) => { const m = new Map<string, number[]>(); evs.forEach((e) => (m.get(e.month) ?? m.set(e.month, []).get(e.month)!).push(e.r - (baseBySym.get(e.sym) ?? 0))); return m; };
  const blockCI = (evs: Ev[]) => {
    const m = byMonth(evs); const months = [...m.keys()].sort();
    const nBlk = Math.ceil(months.length / BLOCK), maxS = Math.max(0, months.length - BLOCK), boot: number[] = [];
    for (let b = 0; b < B; b++) { const samp: number[] = []; for (let k = 0; k < nBlk; k++) { const s = Math.floor(rng() * (maxS + 1)); for (let j = s; j < Math.min(months.length, s + BLOCK); j++) samp.push(...m.get(months[j])!); } boot.push(mean(samp)); }
    return boot;
  };
  const top = sorted.slice(Math.floor(0.8 * N)), bot = sorted.slice(0, Math.floor(0.2 * N));
  const topB = blockCI(top), botB = blockCI(bot);
  const topLo = pctl(topB, 0.025), topHi = pctl(topB, 0.975);
  const botLo = pctl(botB, 0.025), botHi = pctl(botB, 0.975);
  console.log("\n── ② 头/尾分位 edge 的月度块自助 95% CI ──");
  console.log(`  top20%(好消息)  edge=${fmtP(mean(qEdges[4]))}  CI=[${fmtP(topLo)},${fmtP(topHi)}]  P>0=${(topB.filter((x) => x > 0).length / B * 100).toFixed(0)}%  ${topLo > 0 ? "✅漂移为正" : "❌跨0"}`);
  console.log(`  bot20%(坏消息)  edge=${fmtP(mean(qEdges[0]))}  CI=[${fmtP(botLo)},${fmtP(botHi)}]  P<0=${(botB.filter((x) => x < 0).length / B * 100).toFixed(0)}%  ${botHi < 0 ? "✅漂移为负" : "❌跨0"}`);
  console.log("\n判读：top 组 edge 显著>0（且五分位单调、bot 组显著<0）→ PEAD 在本池真实存在，可作事件驱动的中期方向信号。");
}
main();
