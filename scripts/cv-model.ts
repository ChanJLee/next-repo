/**
 * 严格评估：滚动起点交叉验证 + 按日期分块的自助置信区间（block bootstrap CI）。
 *
 * 解决两个被低估的问题：
 *   1) 单次 70/30 切分只看一个 regime → 改为扩窗滚动起点（多折），每折在过去拟合、
 *      在紧邻的未来块测试，得到真·样本外预测，并看每折 skill 的波动（regime 依赖）。
 *   2) 9 个科技标的高度相关 → 同一天的多条样本不是独立信息。对池化的样本外预测做
 *      「按日期分块」自助：每次有放回地重采样【整天】（保留当天所有标的），算 skill，
 *      重复 B 次得 95% CI。这比按行自助宽得多，才是诚实的不确定性。
 *
 * 输出：每折 skill、池化样本外 skill、按日期分块 CI、以及（对照）按行 CI——
 *       看 CI 是否把 0 排除在外，回答「现在这点 skill 到底是不是噪声」。
 *
 * 用法：pnpm exec tsx scripts/cv-model.ts [λ=0.02] [自助次数=2000] [seed=1] [缓存文件] [块长=1]
 *   先跑 scripts/featurize.ts 生成 data/feature-cache.json。
 *   块长>1 → 自助改为重采样【连续 块长 个取样日】的移动块（moving block bootstrap）：
 *   当标签视野 > 取样步长时相邻样本重叠（如 H=63、步长 10 ≈ 6 倍重叠），单日分块的
 *   CI 会因序列相关偏窄；块长应 ≥ ceil(视野/步长)×2（如 H=63、步长 10 → 块长 13）。
 */
import { join } from "node:path";
import { loadCache, fitWeights, predict, mulberry32, type FeatureRow } from "./_fitlib";

const LAMBDA = Number(process.argv[2] ?? 0.02);
const B = Number(process.argv[3] ?? 2000);
const SEED = Number(process.argv[4] ?? 1);
const CACHE_FILE = process.argv[5]; // 可选：评估别的缓存文件（实验用），默认走生产缓存
const BLOCK = Math.max(1, Number(process.argv[6] ?? 1)); // 连续日期块长（取样日个数）
// 扩窗滚动：训练用 [0, cut_i)，测试用 [cut_i, cut_{i+1})。首折至少 40% 数据打底。
const CUTS = [0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];

interface Pred { date: string; y: number; p: number; base: number }

// skill = 1 − Brier(model)/Brier(base)；base 为点-时基准率
function skillOf(rows: Pred[]): number {
  if (rows.length === 0) return 0;
  let bm = 0, bb = 0;
  for (const r of rows) { bm += (r.p - r.y) ** 2; bb += (r.base - r.y) ** 2; }
  return bb > 0 ? 1 - bm / bb : 0;
}

function pct(arr: number[], q: number): number {
  const s = [...arr].sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1))));
  return s[i];
}

function main() {
  const cache = loadCache(CACHE_FILE ? join(process.cwd(), "data", CACHE_FILE) : undefined);
  const NF = cache.rows[0]?.f.length ?? 0;
  const rows = [...cache.rows].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const n = rows.length;
  console.log(`缓存 ${n} 行（${Object.keys(cache.perSymbol).join(", ")}）  特征维=${NF}  λ=${LAMBDA}  B=${B}`);

  // ---- 滚动起点扩窗 CV：每折重拟合 → 真·样本外预测 ----
  console.log("\n── 滚动起点交叉验证（每折在过去拟合、未来块测试）──");
  const oos: Pred[] = [];
  const foldSkills: number[] = [];
  for (let i = 0; i < CUTS.length - 1; i++) {
    const trainEnd = Math.floor(n * CUTS[i]);
    const testEnd = Math.floor(n * CUTS[i + 1]);
    const train = rows.slice(0, trainEnd);
    const test = rows.slice(trainEnd, testEnd);
    if (train.length < 500 || test.length === 0) continue;
    const params = fitWeights(train, { lambda: LAMBDA, seed: SEED, dim: NF });
    const preds: Pred[] = test.map((r) => ({ date: r.date, y: r.y, p: predict(r, params), base: r.base }));
    const sk = skillOf(preds);
    foldSkills.push(sk);
    oos.push(...preds);
    console.log(`  fold ${i}: 训练≤${rows[trainEnd - 1].date}  测试 ${test[0].date}~${test[test.length - 1].date}  n=${test.length}  skill=${sk >= 0 ? "+" : ""}${sk.toFixed(4)}`);
  }
  const meanFold = foldSkills.reduce((a, b) => a + b, 0) / foldSkills.length;
  const posFolds = foldSkills.filter((s) => s > 0).length;
  console.log(`  每折 skill 均值=${meanFold.toFixed(4)}  为正的折数=${posFolds}/${foldSkills.length}`);

  // ---- 池化样本外 skill + 自助 CI ----
  const pooled = skillOf(oos);
  console.log(`\n── 池化样本外 skill = ${pooled >= 0 ? "+" : ""}${pooled.toFixed(4)}（n=${oos.length}）──`);

  const rng = mulberry32(SEED);
  // 按日期分块：重采样整天，保留当天全部标的（吸收截面相关）。
  // BLOCK>1 → 移动块自助：每次抽「连续 BLOCK 个取样日」，再吸收标签重叠造成的序列相关。
  const byDate = new Map<string, Pred[]>();
  for (const r of oos) (byDate.get(r.date) ?? byDate.set(r.date, []).get(r.date)!).push(r);
  const dates = [...byDate.keys()].sort();
  const nBlocks = Math.ceil(dates.length / BLOCK);
  const maxStart = Math.max(0, dates.length - BLOCK);
  const blockSkills: number[] = [];
  for (let b = 0; b < B; b++) {
    const sample: Pred[] = [];
    for (let k = 0; k < nBlocks; k++) {
      const s = Math.floor(rng() * (maxStart + 1));
      for (let j = s; j < Math.min(dates.length, s + BLOCK); j++) sample.push(...byDate.get(dates[j])!);
    }
    blockSkills.push(skillOf(sample));
  }
  // 对照：按行重采样（忽略截面相关，会偏窄）
  const rowSkills: number[] = [];
  for (let b = 0; b < B; b++) {
    const sample: Pred[] = [];
    for (let k = 0; k < oos.length; k++) sample.push(oos[Math.floor(rng() * oos.length)]);
    rowSkills.push(skillOf(sample));
  }

  const fmt = (x: number) => `${x >= 0 ? "+" : ""}${x.toFixed(4)}`;
  const blockPos = blockSkills.filter((s) => s > 0).length / B;
  const rowPos = rowSkills.filter((s) => s > 0).length / B;
  console.log("\n── 自助 95% 置信区间（skill）──");
  const blockLabel = BLOCK > 1 ? `连续 ${BLOCK} 日移动块（诚实）` : "按日期分块（诚实）";
  console.log(`  ${blockLabel}: [${fmt(pct(blockSkills, 0.025))}, ${fmt(pct(blockSkills, 0.975))}]  中位=${fmt(pct(blockSkills, 0.5))}  P(skill>0)=${(blockPos * 100).toFixed(1)}%`);
  console.log(`  按行（偏窄，对照）: [${fmt(pct(rowSkills, 0.025))}, ${fmt(pct(rowSkills, 0.975))}]  中位=${fmt(pct(rowSkills, 0.5))}  P(skill>0)=${(rowPos * 100).toFixed(1)}%`);

  // ---- 收缩扫描：tilt × s 的样本外 skill，找最优全局收缩 s*（用于把生产 tilt 收到诚实水平）----
  const logit = (p: number) => Math.log(p / (1 - p));
  const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
  const clamp = (p: number) => Math.min(0.99, Math.max(0.01, p));
  const shrunkSkill = (s: number): number => {
    const rows: Pred[] = oos.map((o) => {
      const tilt = logit(o.p) - logit(clamp(o.base));
      return { ...o, p: clamp(sigmoid(logit(clamp(o.base)) + s * tilt)) };
    });
    return skillOf(rows);
  };
  console.log("\n── 收缩扫描（tilt × s 的样本外 skill；s=1 即现状，s=0 即只报基准率）──");
  let best = { s: 0, sk: 0 };
  for (let s = 0; s <= 1.0001; s += 0.1) {
    const sk = shrunkSkill(s);
    if (sk > best.sk) best = { s, sk };
    console.log(`  s=${s.toFixed(1)}  skill=${fmt(sk)}`);
  }
  console.log(`  → 最优收缩 s*=${best.s.toFixed(1)}（skill=${fmt(best.sk)}）：把生产权重整体 ×${best.s.toFixed(1)} 最诚实。`);

  console.log("\n判读：按日期分块 CI 若跨 0 / 折数为正不过半 → 现有 skill 在统计上与噪声无异。");
}

main();
