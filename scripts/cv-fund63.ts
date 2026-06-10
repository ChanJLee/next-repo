/**
 * 方向 1 核心检验（不依赖 Stooq，纯用 fund-cache）：
 * valmom=z(B/M)+z(12-1动量) 能否给【单标的 63 日绝对方向】带来过滚动 CV + 移动块自助 CI
 * 的真实样本外 skill？
 *
 * 与 test-fund-factors 的区别：那个测的是「截面 rank spread」（多空组合收益）；这里测的是
 * 「把 valmom 当概率特征预测单股 UP/DOWN」——即能不能把它变成详情页那个概率数。两件事不同：
 * 截面 spread 为正 ≠ 单股方向可校准（基准率本身≈55%，valmom 要在它之上再加信息才算 skill>0）。
 *
 * 模型：P(up) = sigmoid(logit(base) + w·tanh(valmom))，w 在训练折上拟合（一维，配 L2）。
 * base = 点-时上涨率（截至该日已揭晓结局的所有样本的 fwd>0 比例，无未来函数）。
 * 评估：扩窗滚动起点 CV（按日期）+ 连续日期块移动块自助（块长默认 13，吸收 H=63 重叠）。
 *
 * 用法：pnpm exec tsx scripts/cv-fund63.ts [fundCache=fund-cache.json] [B=2000] [块长=13] [λ=0.5] [seed=1]
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mulberry32 } from "./_fitlib";

const CACHE = process.argv[2] ?? "fund-cache.json";
const B = Number(process.argv[3] ?? 2000);
const BLOCK = Math.max(1, Number(process.argv[4] ?? 13));
const LAMBDA = Number(process.argv[5] ?? 0.5);
const SEED = Number(process.argv[6] ?? 1);
const MIN_SYMBOLS = 10;
const HORIZON_DAYS = 63 + 10; // fwd 视野（交易日）→ 用日历天近似判定"结局已揭晓"，宽松留余量

const logit = (p: number) => Math.log(p / (1 - p));
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const clamp = (p: number) => Math.min(0.99, Math.max(0.01, p));
const clampF = (v: number) => Math.min(4, Math.max(-4, Number.isFinite(v) ? v : 0));

interface FundRow { sym: string; date: string; f: (number | null)[]; fwd: number }
interface Sample { date: string; t: number; y: number; vm: number; base: number }

const cache = JSON.parse(readFileSync(join(process.cwd(), "data", CACHE), "utf8")) as { horizon: number; factorNames: string[]; rows: FundRow[] };
const IDX_BM = cache.factorNames.indexOf("bm");
const IDX_MOM = cache.factorNames.indexOf("mom");

// 1) 每日截面 z(bm)/z(mom) → valmom；同时收集 (sym,date,fwd,label)
const byDate = new Map<string, FundRow[]>();
for (const r of cache.rows) (byDate.get(r.date) ?? byDate.set(r.date, []).get(r.date)!).push(r);
const dates = [...byDate.keys()].sort();
const dayIdx = new Map(dates.map((d, i) => [d, i]));

const samples: Sample[] = [];
for (const date of dates) {
  const rows = byDate.get(date)!;
  const valid = rows.filter((r) => r.f[IDX_BM] != null && r.f[IDX_MOM] != null && Number.isFinite(r.f[IDX_BM]!) && Number.isFinite(r.f[IDX_MOM]!));
  if (valid.length < MIN_SYMBOLS) continue;
  const z = (k: number) => {
    const v = valid.map((r) => r.f[k]!);
    const m = v.reduce((a, b) => a + b, 0) / v.length;
    const sd = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length) || 1;
    return v.map((x) => (x - m) / sd);
  };
  const zbm = z(IDX_BM), zmom = z(IDX_MOM);
  valid.forEach((r, i) => {
    samples.push({ date, t: dayIdx.get(date)!, y: r.fwd > 0 ? 1 : 0, vm: clampF((zbm[i] + zmom[i]) / 2), base: 0.5 });
  });
}
samples.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

// 2) 点-时基准率：date d 的样本只能用「结局已在 d 之前揭晓」的样本估上涨率。
//    结局揭晓日 ≈ 取样日 + HORIZON_DAYS 交易日。用 dayIdx 距离近似（步长10 → 视野约 7~8 个取样日）。
const realizedAfter = Math.ceil((cache.horizon + 5) / 10 /*step*/); // 标签 j 的结局在约 7 个取样日后揭晓
for (const s of samples) {
  let up = 0, n = 0;
  for (const o of samples) {
    if (o.t <= s.t - realizedAfter) { up += o.y; n++; }
  }
  s.base = n >= 30 ? clamp(up / n) : 0.5;
}

// 3) 一维校准层拟合（DE 太重，直接网格 + 抛物线细化；目标 = 训练 Brier + λw²）
function fitW(train: Sample[]): number {
  const brier = (w: number) => {
    let s = 0;
    for (const r of train) { const p = clamp(sigmoid(logit(r.base) + w * Math.tanh(r.vm))); s += (p - r.y) ** 2; }
    return s / train.length + LAMBDA * w * w;
  };
  let best = 0, bestV = brier(0);
  for (let w = -1.0; w <= 1.0001; w += 0.02) { const v = brier(w); if (v < bestV) { bestV = v; best = w; } }
  return +best.toFixed(4);
}

function skillOf(rows: { y: number; p: number; base: number }[]): number {
  if (rows.length === 0) return 0;
  let bm = 0, bb = 0;
  for (const r of rows) { bm += (r.p - r.y) ** 2; bb += (r.base - r.y) ** 2; }
  return bb > 0 ? 1 - bm / bb : 0;
}
const pct = (arr: number[], q: number) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1))))]; };
const fmt = (x: number) => `${x >= 0 ? "+" : ""}${x.toFixed(4)}`;

function main() {
  console.log(`cv-fund63  缓存=${CACHE}  H=${cache.horizon}  样本=${samples.length}（${samples[0].date}~${samples[samples.length - 1].date}）  λ=${LAMBDA}  块长=${BLOCK}`);
  console.log(`基准率（全样本上涨率）=${(samples.reduce((a, s) => a + s.y, 0) / samples.length).toFixed(4)}`);

  const CUTS = [0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
  const n = samples.length;
  const oos: { date: string; y: number; p: number; base: number }[] = [];
  const foldSkills: number[] = [];
  console.log("\n── 滚动起点交叉验证（每折在过去拟合 w、未来块测试）──");
  for (let i = 0; i < CUTS.length - 1; i++) {
    const a = Math.floor(n * CUTS[i]), b = Math.floor(n * CUTS[i + 1]);
    const train = samples.slice(0, a), test = samples.slice(a, b);
    if (train.length < 500 || test.length === 0) continue;
    const w = fitW(train);
    const preds = test.map((r) => ({ date: r.date, y: r.y, p: clamp(sigmoid(logit(r.base) + w * Math.tanh(r.vm))), base: r.base }));
    const sk = skillOf(preds);
    foldSkills.push(sk); oos.push(...preds);
    console.log(`  fold ${i}: 训练≤${samples[a - 1].date}  测试 ${test[0].date}~${test[test.length - 1].date}  n=${test.length}  w=${fmt(w)}  skill=${fmt(sk)}`);
  }
  const meanFold = foldSkills.reduce((a, b) => a + b, 0) / foldSkills.length;
  console.log(`  每折 skill 均值=${fmt(meanFold)}  为正折数=${foldSkills.filter((s) => s > 0).length}/${foldSkills.length}`);

  const pooled = skillOf(oos);
  console.log(`\n── 池化样本外 skill = ${fmt(pooled)}（n=${oos.length}）──`);

  // 移动块自助：抽连续 BLOCK 个取样日
  const rng = mulberry32(SEED);
  const byD = new Map<string, typeof oos>();
  for (const r of oos) (byD.get(r.date) ?? byD.set(r.date, []).get(r.date)!).push(r);
  const oosDates = [...byD.keys()].sort();
  const nBlk = Math.ceil(oosDates.length / BLOCK);
  const maxStart = Math.max(0, oosDates.length - BLOCK);
  const blk: number[] = [];
  for (let b = 0; b < B; b++) {
    const samp: typeof oos = [];
    for (let k = 0; k < nBlk; k++) { const s = Math.floor(rng() * (maxStart + 1)); for (let j = s; j < Math.min(oosDates.length, s + BLOCK); j++) samp.push(...byD.get(oosDates[j])!); }
    blk.push(skillOf(samp));
  }
  const pPos = blk.filter((s) => s > 0).length / B;
  console.log(`\n── 连续 ${BLOCK} 日移动块自助 95% CI ──`);
  console.log(`  [${fmt(pct(blk, 0.025))}, ${fmt(pct(blk, 0.975))}]  中位=${fmt(pct(blk, 0.5))}  P(skill>0)=${(pPos * 100).toFixed(1)}%`);
  console.log(`\n判读：CI 排除 0 且折数过半为正 → valmom 对单股 63 日方向有真实可校准 skill，可上概率模型；否则它只是截面排序信号，不该当方向概率。`);
}

main();
