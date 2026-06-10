/**
 * 换打法再攻方向：时间序列动量（绝对/TSMOM）能否预测单股【中期绝对方向】。
 *
 * 与已验证的【截面】动量（同类里谁强）不同，这测【绝对】动量：这只票相对自己 12 个月前
 * 涨了多少 → 预测它未来 H 日是涨是跌（Moskowitz/Ooi/Pedersen "Time Series Momentum"）。
 * 这是单资产方向信号，正是用户要的"一波中期行情"的方向那一半，且本仓库从未干净测过。
 *
 * 诚实坎：大盘长期上行会让"动量为正→后续也涨"假性成立。故所有 skill 一律对【点-时基准率】
 * 度量（基准率已吃掉长期漂移），绝对动量必须在"反正都涨"之上再加信息才算数。
 * 数据：fund-cache.json 每行已含 mom(绝对12-1) 与 fwd(63日绝对收益)，无需 Stooq。
 *
 * 三视角：① 绝对动量五分位的未来收益/上涨率（看单调性）② 多空(top−bottom)收益 + 块自助 CI
 *   ③ 把 mom 校准成 P(涨) 的滚动 CV 样本外方向 skill（与 cv-fund63 同法，feature=绝对mom）。
 *
 * 用法：pnpm exec tsx scripts/test-tsmom.ts [B=2000] [块长=13] [seed=1]
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mulberry32 } from "./_fitlib";

const B = Number(process.argv[2] ?? 2000);
const BLOCK = Math.max(1, Number(process.argv[3] ?? 13));
const SEED = Number(process.argv[4] ?? 1);

const logit = (p: number) => Math.log(p / (1 - p));
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const clamp = (p: number) => Math.min(0.99, Math.max(0.01, p));
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const fmtP = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(2)}%`;
const fmt = (x: number) => `${x >= 0 ? "+" : ""}${x.toFixed(4)}`;
const pct = (arr: number[], q: number) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1))))]; };

interface FundRow { sym: string; date: string; f: (number | null)[]; fwd: number }
const cache = JSON.parse(readFileSync(join(process.cwd(), "data", "fund-cache.json"), "utf8")) as { horizon: number; factorNames: string[]; rows: FundRow[] };
const IDX_MOM = cache.factorNames.indexOf("mom");

interface S { date: string; t: number; mom: number; fwd: number; y: number; base: number }
const dates = [...new Set(cache.rows.map((r) => r.date))].sort();
const dayIdx = new Map(dates.map((d, i) => [d, i]));
const samples: S[] = [];
for (const r of cache.rows) {
  const m = r.f[IDX_MOM];
  if (m == null || !Number.isFinite(m)) continue;
  samples.push({ date: r.date, t: dayIdx.get(r.date)!, mom: m, fwd: r.fwd, y: r.fwd > 0 ? 1 : 0, base: 0.5 });
}
samples.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

// 点-时基准率：只用结局已揭晓（约 7 个取样日前）的样本估上涨率
const realizedAfter = Math.ceil((cache.horizon + 5) / 10);
for (const s of samples) {
  let up = 0, n = 0;
  for (const o of samples) if (o.t <= s.t - realizedAfter) { up += o.y; n++; }
  s.base = n >= 30 ? clamp(up / n) : 0.5;
}
const momSd = Math.sqrt(mean(samples.map((s) => s.mom ** 2)) - mean(samples.map((s) => s.mom)) ** 2) || 1;

function skillOf(rows: { y: number; p: number; base: number }[]): number {
  if (!rows.length) return 0;
  let bm = 0, bb = 0;
  for (const r of rows) { bm += (r.p - r.y) ** 2; bb += (r.base - r.y) ** 2; }
  return bb > 0 ? 1 - bm / bb : 0;
}

function main() {
  const N = samples.length;
  console.log(`test-tsmom  样本=${N}（${samples[0].date}~${samples[N - 1].date}）H=${cache.horizon}  无条件上涨率=${(mean(samples.map((s) => s.y))).toFixed(4)}  块长=${BLOCK}`);

  // ① 绝对动量五分位
  console.log("\n── ① 绝对动量五分位（看未来收益/上涨率是否单调随动量上升）──");
  const sorted = [...samples].sort((a, b) => a.mom - b.mom);
  for (let q = 0; q < 5; q++) {
    const part = sorted.slice(Math.floor(q * N / 5), Math.floor((q + 1) * N / 5));
    console.log(`  Q${q + 1} mom∈[${pct(part.map(p=>p.mom),0).toFixed(2)},${pct(part.map(p=>p.mom),1).toFixed(2)}]  平均fwd=${fmtP(mean(part.map((p) => p.fwd)))}  上涨率=${(mean(part.map((p) => p.y))).toFixed(3)}  基准率均=${(mean(part.map((p) => p.base))).toFixed(3)}  (${part.length})`);
  }

  // ② 多空 spread（top20%−bottom20%）按取样日聚合 + 块自助 CI
  console.log("\n── ② 时间序列多空 spread（高动量−低动量未来收益；块自助 CI）──");
  const byDate = new Map<string, S[]>();
  for (const s of samples) (byDate.get(s.date) ?? byDate.set(s.date, []).get(s.date)!).push(s);
  const daySpreads: { date: string; v: number }[] = [];
  for (const [date, rows] of byDate) {
    if (rows.length < 10) continue;
    const o = [...rows].sort((a, b) => a.mom - b.mom);
    const k = Math.max(1, Math.floor(o.length / 5));
    const lo = mean(o.slice(0, k).map((r) => r.fwd)), hi = mean(o.slice(o.length - k).map((r) => r.fwd));
    daySpreads.push({ date, v: hi - lo });
  }
  daySpreads.sort((a, b) => (a.date < b.date ? -1 : 1));
  const rng = mulberry32(SEED);
  const blkMean = (vals: number[]) => {
    const nB = Math.ceil(vals.length / BLOCK), maxS = Math.max(0, vals.length - BLOCK), out: number[] = [];
    for (let b = 0; b < B; b++) { const samp: number[] = []; for (let k = 0; k < nB; k++) { const s = Math.floor(rng() * (maxS + 1)); for (let j = s; j < Math.min(vals.length, s + BLOCK); j++) samp.push(vals[j]); } out.push(mean(samp)); }
    return out;
  };
  const sp = daySpreads.map((d) => d.v);
  const spB = blkMean(sp);
  console.log(`  spread 均值=${fmtP(mean(sp))}/${cache.horizon}d  CI=[${fmtP(pct(spB, 0.025))},${fmtP(pct(spB, 0.975))}]  P>0=${(spB.filter((x) => x > 0).length / B * 100).toFixed(0)}%  (${daySpreads.length}日)`);

  // ③ 把 mom 校准成 P(涨) → 滚动 CV 样本外方向 skill（vs 点-时基准率）
  console.log("\n── ③ 绝对动量当方向概率：滚动起点 CV 样本外 skill（vs 点-时基准率）──");
  const fitW = (train: S[]): number => {
    const brier = (w: number) => mean(train.map((r) => (clamp(sigmoid(logit(r.base) + w * Math.tanh(r.mom / momSd))) - r.y) ** 2));
    let best = 0, bestV = brier(0);
    for (let w = -1; w <= 1.0001; w += 0.02) { const v = brier(w); if (v < bestV) { bestV = v; best = w; } }
    return +best.toFixed(4);
  };
  const CUTS = [0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
  const oos: { date: string; y: number; p: number; base: number }[] = [];
  const foldSk: number[] = [];
  for (let i = 0; i < CUTS.length - 1; i++) {
    const a = Math.floor(N * CUTS[i]), b = Math.floor(N * CUTS[i + 1]);
    const tr = samples.slice(0, a), te = samples.slice(a, b);
    if (tr.length < 500 || !te.length) continue;
    const w = fitW(tr);
    const preds = te.map((r) => ({ date: r.date, y: r.y, p: clamp(sigmoid(logit(r.base) + w * Math.tanh(r.mom / momSd))), base: r.base }));
    const sk = skillOf(preds); foldSk.push(sk); oos.push(...preds);
    console.log(`  fold ${i}: 测试 ${te[0].date}~${te[te.length - 1].date}  w=${fmt(w)}  skill=${fmt(sk)}`);
  }
  console.log(`  每折 skill 均值=${fmt(mean(foldSk))}  为正折数=${foldSk.filter((s) => s > 0).length}/${foldSk.length}`);
  const pooled = skillOf(oos);
  // 块自助 CI on pooled skill
  const byD = new Map<string, typeof oos>();
  for (const r of oos) (byD.get(r.date) ?? byD.set(r.date, []).get(r.date)!).push(r);
  const oosDates = [...byD.keys()].sort();
  const nB = Math.ceil(oosDates.length / BLOCK), maxS = Math.max(0, oosDates.length - BLOCK), skB: number[] = [];
  for (let b = 0; b < B; b++) { const samp: typeof oos = []; for (let k = 0; k < nB; k++) { const s = Math.floor(rng() * (maxS + 1)); for (let j = s; j < Math.min(oosDates.length, s + BLOCK); j++) samp.push(...byD.get(oosDates[j])!); } skB.push(skillOf(samp)); }
  console.log(`  池化样本外 skill=${fmt(pooled)}（n=${oos.length}）  块自助 CI=[${fmt(pct(skB, 0.025))},${fmt(pct(skB, 0.975))}]  P>0=${(skB.filter((x) => x > 0).length / B * 100).toFixed(0)}%`);

  console.log("\n判读：①单调上升 + ②CI排除0 → 绝对动量对中期收益有方向性；但③skill 才说明它能否在【点-时基准率】之上预测单股方向。三者都过才算真方向信号。");
}

main();
