/**
 * 重设计的核心检验台：事件 → 前瞻【期望值】（不是方向命中率）。
 *
 * 死胡同诊断：之前三次测方向都用 Brier/命中率 vs 基准率打分——那是给"概率校准"用的尺子。
 * 但用户要的"catch 一波中期行情"是【趋势跟随】：命中率可以 <50% 仍赚钱，靠赢大亏小的赔率不对称。
 * 所以这里改问："某个【波段启动】事件之后，带移动止损持有到 H 日的交易期望，是否显著优于
 * 在同一标的随机进场？"——这才是趋势跟随该用的尺子。
 *
 * 方法（无未来函数、因果）：
 *   · 候选事件（逐根、上一根不成立才算起点）：
 *       hi252   收盘创 252 日新高（突破/趋势启动）
 *       golden  收盘上穿 MA50 且 MA50>MA200（多头排列确认）
 *       donch55 收盘突破 55 日 Donchian 上轨（经典海龟趋势入场）
 *       pullbuy 升势中回调：close>MA200 且 RSI14<=35（顺势回调买点）
 *   · 交易：事件次根开盘进场，持有至 min(H 日, 触发 k×ATR 移动止损)。记净收益 r。
 *   · 基准：同标的全体可交易根做同样的"次根进场+同规则移动止损持有"，得无条件期望（matched baseline）。
 *   · 统计：edge = 事件期望 − 同标的基准期望（逐事件，已减该标的漂移）。按【事件月份】块自助 95% CI。
 *     另报命中率、平均盈/亏、盈亏比，证明"即使命中率不高、期望可正"。
 *
 * 用法：pnpm exec tsx scripts/test-wave-events.ts [H=63] [ATR止损=3] [B=2000] [块长=6] [seed=1]
 *   先跑 build-universe-cache.ts。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mulberry32 } from "./_fitlib";

const H = Number(process.argv[2] ?? 63);
const ATR_K = Number(process.argv[3] ?? 3);
const B = Number(process.argv[4] ?? 2000);
const BLOCK = Math.max(1, Number(process.argv[5] ?? 6));
const SEED = Number(process.argv[6] ?? 1);
const MIN_BARS = 300;

interface C { date: string; open: number; high: number; low: number; close: number; volume: number }
const cache = JSON.parse(readFileSync(join(process.cwd(), "data", "universe-candles.json"), "utf8")) as { candles: Record<string, C[]> };

const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const pctl = (arr: number[], q: number) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1))))]; };
const fmtP = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(2)}%`;

function sma(closes: number[], i: number, p: number): number | null { if (i + 1 < p) return null; let s = 0; for (let j = i + 1 - p; j <= i; j++) s += closes[j]; return s / p; }
function rsi(closes: number[], i: number, p = 14): number | null {
  if (i < p) return null; let g = 0, l = 0;
  for (let j = i + 1 - p; j <= i; j++) { const d = closes[j] - closes[j - 1]; if (d >= 0) g += d; else l -= d; }
  if (g === 0 && l === 0) return 50; const rs = l === 0 ? 100 : g / l; return 100 - 100 / (1 + rs);
}
function atr(c: C[], i: number, p = 14): number | null {
  if (i < p) return null; let s = 0;
  for (let j = i + 1 - p; j <= i; j++) { const tr = Math.max(c[j].high - c[j].low, Math.abs(c[j].high - c[j - 1].close), Math.abs(c[j].low - c[j - 1].close)); s += tr; }
  return s / p;
}
function maxClose(closes: number[], i: number, p: number): number { let m = -Infinity; for (let j = Math.max(0, i - p + 1); j <= i; j++) m = Math.max(m, closes[j]); return m; }

type EventKey = "hi252" | "golden" | "donch55" | "pullbuy";
const EVENTS: EventKey[] = ["hi252", "golden", "donch55", "pullbuy"];

function eventAt(c: C[], closes: number[], i: number, key: EventKey): boolean {
  switch (key) {
    case "hi252": return i >= 252 && closes[i] >= maxClose(closes, i, 252) && closes[i - 1] < maxClose(closes, i - 1, 252);
    case "golden": { const m50 = sma(closes, i, 50), m200 = sma(closes, i, 200), pm50 = sma(closes, i - 1, 50); return !!(m50 && m200 && pm50) && closes[i] > m50! && closes[i - 1] <= pm50! && m50! > m200!; }
    case "donch55": { const hh = maxClose(closes.slice(0, i), i - 1, 55); return i >= 56 && closes[i] > hh && closes[i - 1] <= hh; }
    case "pullbuy": { const m200 = sma(closes, i, 200), r = rsi(closes, i), pr = rsi(closes, i - 1); return !!(m200 && r != null && pr != null) && closes[i] > m200! && r! <= 35 && pr! > 35; }
  }
}

/** 次根开盘进场，持有至 min(H, k×ATR 移动止损命中)；返回净收益率。 */
function tradeReturn(c: C[], entryIdx: number): number | null {
  if (entryIdx >= c.length) return null;
  const entry = c[entryIdx].open;
  if (!(entry > 0)) return null;
  const a0 = atr(c, entryIdx - 1) ?? (entry * 0.02);
  let peak = entry, stop = entry - ATR_K * a0;
  const last = Math.min(c.length - 1, entryIdx + H - 1);
  for (let j = entryIdx; j <= last; j++) {
    if (c[j].low <= stop) return stop / entry - 1;        // 盘中触发移动止损
    if (c[j].close > peak) { peak = c[j].close; const a = atr(c, j) ?? a0; stop = Math.max(stop, peak - ATR_K * a); }
  }
  return c[last].close / entry - 1;
}

interface Ev { sym: string; month: string; r: number }

function main() {
  const syms = Object.entries(cache.candles).filter(([, c]) => c.length >= MIN_BARS);
  console.log(`universe: ${syms.length} 标的  H=${H}  ATR止损=${ATR_K}×  块长(月)=${BLOCK}`);

  // 每标的的"基准期望" = 全可交易根的 tradeReturn 均值（matched 同标的漂移与止损规则）
  const baseBySym = new Map<string, number>();
  for (const [sym, c] of syms) {
    const closes = c.map((x) => x.close); void closes;
    const rs: number[] = [];
    for (let i = 200; i + 1 < c.length - 0; i++) { const r = tradeReturn(c, i + 1); if (r != null) rs.push(r); }
    baseBySym.set(sym, mean(rs));
  }

  const rng = mulberry32(SEED);
  for (const key of EVENTS) {
    const evs: Ev[] = [];
    let win = 0, sumWin = 0, sumLoss = 0, nLoss = 0;
    for (const [sym, c] of syms) {
      const closes = c.map((x) => x.close);
      let prev = false;
      for (let i = 200; i + 1 < c.length; i++) {
        const on = eventAt(c, closes, i, key);
        if (on && !prev) {
          const r = tradeReturn(c, i + 1);
          if (r != null) {
            evs.push({ sym, month: c[i].date.slice(0, 7), r });
            if (r > 0) { win++; sumWin += r; } else { nLoss++; sumLoss += r; }
          }
        }
        prev = on;
      }
    }
    if (evs.length < 30) { console.log(`\n[${key}] 事件太少(${evs.length})`); continue; }
    // edge = 事件收益 − 同标的基准（逐事件减漂移）
    const edges = evs.map((e) => e.r - (baseBySym.get(e.sym) ?? 0));
    const rawMean = mean(evs.map((e) => e.r));
    const edgeMean = mean(edges);
    const hit = win / evs.length;
    const avgWin = win ? sumWin / win : 0, avgLoss = nLoss ? sumLoss / nLoss : 0;
    const payoff = avgLoss !== 0 ? Math.abs(avgWin / avgLoss) : Infinity;

    // 按事件月份分块自助（吸收同期市场共振）
    const byMonth = new Map<string, number[]>();
    evs.forEach((e, k) => (byMonth.get(e.month) ?? byMonth.set(e.month, []).get(e.month)!).push(edges[k]));
    const months = [...byMonth.keys()].sort();
    const nBlk = Math.ceil(months.length / BLOCK), maxS = Math.max(0, months.length - BLOCK);
    const boot: number[] = [];
    for (let b = 0; b < B; b++) {
      const samp: number[] = [];
      for (let k = 0; k < nBlk; k++) { const s = Math.floor(rng() * (maxS + 1)); for (let j = s; j < Math.min(months.length, s + BLOCK); j++) samp.push(...byMonth.get(months[j])!); }
      boot.push(mean(samp));
    }
    const lo = pctl(boot, 0.025), hi = pctl(boot, 0.975), pPos = boot.filter((x) => x > 0).length / B;
    const verdict = lo > 0 ? "✅ 期望显著为正" : hi < 0 ? "❌ 显著为负" : "❌ 跨0(与随机进场无异)";
    console.log(`\n[${key}] n=${evs.length}  原始期望=${fmtP(rawMean)}/${H}d  减漂移edge=${fmtP(edgeMean)}  CI=[${fmtP(lo)},${fmtP(hi)}]  P>0=${(pPos * 100).toFixed(0)}%  ${verdict}`);
    console.log(`        命中率=${(hit * 100).toFixed(0)}%  平均盈=${fmtP(avgWin)}  平均亏=${fmtP(avgLoss)}  盈亏比=${payoff.toFixed(2)}  （趋势跟随：命中率低但盈亏比>1 也能正期望）`);
  }
  console.log("\n判读：减漂移 edge 的月度块自助 CI 排除 0 → 该事件相对随机进场有真实可捕捉的波段期望（带止损）。");
}
main();
