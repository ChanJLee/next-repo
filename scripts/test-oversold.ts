/**
 * 单规则严格检验：「下跌段 + 极度超卖 → 未来上涨率显著高于基准」（你图表上看到的"低概率反转"）。
 *
 * 不拟合任何权重，只测一个二元触发器，避免大杂烩 tilt 的过拟合。诚实点：
 *   · 点-时阈值：每折只用【过去】窗口定"超卖"分位阈值，再在【未来】块触发，杜绝未来函数。
 *   · 触发器：ret20 < 0（近端下跌）且 ext20 ≤ 训练集下跌样本的 P10（最深超卖 10%）。
 *   · 度量：池化样本外里，触发样本的未来上涨率 − 同期基准上涨率 = edge。
 *   · 显著性：按【日期分块】自助（重采样整天，吸收 34/9 标的的截面相关）给 edge 95% CI。
 *   · 对照：无条件超卖、最超买（看是否"超买反转向下"——上轮发现是续涨而非反转）。
 *
 * 用法：pnpm exec tsx scripts/test-oversold.ts [缓存文件=feature-cache.json] [超卖分位=0.1] [自助=2000]
 */
import { join } from "node:path";
import { loadCache, mulberry32, type FeatureRow } from "./_fitlib";

const CACHE_FILE = process.argv[2] ?? "feature-cache.json";
const OS_Q = Number(process.argv[3] ?? 0.1);   // 超卖分位（下 10%）
const B = Number(process.argv[4] ?? 2000);
const CUTS = [0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
const RET20 = 2, EXT20 = 3; // f 的下标

function quantile(arr: number[], q: number): number {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * s.length)))];
}

interface Obs { date: string; y: number; fired: boolean }

// 给定触发判定，做滚动起点 OOS，返回池化样本外观测
function rollOOS(rows: FeatureRow[], fire: (r: FeatureRow, thr: { osDown: number; os: number; ob: number }) => boolean): Obs[] {
  const n = rows.length;
  const out: Obs[] = [];
  for (let i = 0; i < CUTS.length - 1; i++) {
    const train = rows.slice(0, Math.floor(n * CUTS[i]));
    const test = rows.slice(Math.floor(n * CUTS[i]), Math.floor(n * CUTS[i + 1]));
    if (train.length < 500 || test.length === 0) continue;
    const thr = {
      osDown: quantile(train.filter((r) => r.f[RET20] < 0).map((r) => r.f[EXT20]), OS_Q),
      os: quantile(train.map((r) => r.f[EXT20]), OS_Q),
      ob: quantile(train.map((r) => r.f[EXT20]), 1 - OS_Q),
    };
    for (const r of test) out.push({ date: r.date, y: r.y, fired: fire(r, thr) });
  }
  return out;
}

function edgeCI(obs: Obs[], label: string, rng: () => number): void {
  const fired = obs.filter((o) => o.fired);
  if (fired.length === 0) { console.log(`  ${label}: 无触发`); return; }
  const base = obs.reduce((a, o) => a + o.y, 0) / obs.length;
  const upFired = fired.reduce((a, o) => a + o.y, 0) / fired.length;
  const edge = upFired - base;
  // 按日期分块自助 edge
  const byDate = new Map<string, Obs[]>();
  for (const o of obs) (byDate.get(o.date) ?? byDate.set(o.date, []).get(o.date)!).push(o);
  const dates = [...byDate.keys()];
  const edges: number[] = [];
  for (let b = 0; b < B; b++) {
    const s: Obs[] = [];
    for (let k = 0; k < dates.length; k++) s.push(...byDate.get(dates[Math.floor(rng() * dates.length)])!);
    const f = s.filter((o) => o.fired);
    if (f.length === 0) continue;
    edges.push(f.reduce((a, o) => a + o.y, 0) / f.length - s.reduce((a, o) => a + o.y, 0) / s.length);
  }
  edges.sort((a, b) => a - b);
  const lo = edges[Math.floor(0.025 * edges.length)], hi = edges[Math.floor(0.975 * edges.length)];
  const pPos = edges.filter((e) => e > 0).length / edges.length;
  const fireRate = (fired.length / obs.length) * 100;
  const knife = (fired.filter((o) => o.y === 0).length / fired.length) * 100;
  const f4 = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}pp`;
  console.log(`  ${label}`);
  console.log(`     触发样本未来上涨率=${(upFired * 100).toFixed(1)}%  基准=${(base * 100).toFixed(1)}%  edge=${f4(edge)}  (触发占比 ${fireRate.toFixed(1)}%, 接飞刀率 ${knife.toFixed(1)}%)`);
  console.log(`     edge 95% CI=[${f4(lo)}, ${f4(hi)}]  P(edge>0)=${(pPos * 100).toFixed(1)}%  → ${lo > 0 ? "✅ 显著为正" : "❌ 跨 0，不显著"}`);
}

function main() {
  const cache = loadCache(join(process.cwd(), "data", CACHE_FILE));
  const rows = [...cache.rows].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  console.log(`缓存 ${rows.length} 行  H=${cache.horizon}  超卖分位 P${(OS_Q * 100).toFixed(0)}  B=${B}\n`);
  const rng = mulberry32(1);

  console.log("── 主检验：下跌段 + 极度超卖 → 反弹 ──");
  edgeCI(rollOOS(rows, (r, t) => r.f[RET20] < 0 && r.f[EXT20] <= t.osDown), "下跌段(ret20<0) 且 ext20≤P10", rng);
  console.log("\n── 对照 ──");
  edgeCI(rollOOS(rows, (r, t) => r.f[EXT20] <= t.os), "无条件最超卖(ext20≤P10)", rng);
  edgeCI(rollOOS(rows, (r, t) => r.f[EXT20] >= t.ob), "最超买(ext20≥P90) —— 看是否反转向下", rng);
}

main();
