/**
 * 方向2 验证：未来 H 日已实现波动率能否被近端波动预测（OOS），按项目诚实标准。
 *
 * 与方向信号（已全证伪）相反的一面：日线方向≈随机游走，但波动会【聚集】且向长期均值
 * 【回归】，是金融数据里最稳的可预测量。本脚本在库内各标的全历史上，用扩窗滚动起点 CV
 * 测「log(未来H日波动) ~ log(近look日波动)」线性拟合的样本外 R²（vs 训练集 fwd 均值基准）
 * 与 rank IC。结论支撑 src/lib/signals/position.ts:forwardVolForecast 的上线。
 *
 * 实测（9 标的 5.8 万样本，H=20 look=20）：池化 OOS R²≈0.62、6/6 折为正、rankIC≈0.72、
 * 斜率稳定≈0.77（<1 即均值回归）。
 *
 * 用法：pnpm exec tsx scripts/test-vol-forecast.ts [H=20] [look=20]
 */
import { prisma } from "../src/lib/db";

const H = Number(process.argv[2] ?? 20);
const LOOK = Number(process.argv[3] ?? 20);
const MIN = 300;

const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

function rv(closes: number[], i: number, p: number): number | null {
  if (i < p) return null;
  const r: number[] = [];
  for (let j = i - p + 1; j <= i; j++) if (closes[j - 1] > 0 && closes[j] > 0) r.push(Math.log(closes[j] / closes[j - 1]));
  if (r.length < 2) return null;
  const m = mean(r);
  const v = Math.sqrt(mean(r.map((x) => (x - m) ** 2)));
  return v > 0 ? v : null;
}

function spearman(xs: number[], ys: number[]): number {
  const rank = (a: number[]) => {
    const idx = a.map((v, i) => [v, i] as [number, number]).sort((p, q) => p[0] - q[0]);
    const r = new Array(a.length);
    idx.forEach(([, i], k) => (r[i] = k));
    return r as number[];
  };
  const rx = rank(xs), ry = rank(ys), n = xs.length, mx = mean(rx), my = mean(ry);
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) { num += (rx[i] - mx) * (ry[i] - my); dx += (rx[i] - mx) ** 2; dy += (ry[i] - my) ** 2; }
  return dx && dy ? num / Math.sqrt(dx * dy) : 0;
}

async function main() {
  const syms = await prisma.symbol.findMany({ include: { candles: { orderBy: { date: "asc" } } } });
  const rows: { date: string; x: number; y: number }[] = [];
  for (const s of syms) {
    const closes = s.candles.map((c) => c.close);
    const n = closes.length;
    if (n < MIN + H) continue;
    for (let i = LOOK; i + H < n; i++) {
      const cur = rv(closes, i, LOOK), fwd = rv(closes, i + H, H);
      if (cur == null || fwd == null) continue;
      rows.push({ date: s.candles[i].date.toISOString().slice(0, 10), x: Math.log(cur), y: Math.log(fwd) });
    }
  }
  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const N = rows.length;
  console.log(`样本 ${N}（${rows[0].date}~${rows[N - 1].date}）H=${H} look=${LOOK}`);

  const CUTS = [0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
  const folds: { r2: number; ic: number }[] = [];
  const oos: { p: number; y: number; base: number }[] = [];
  for (let f = 0; f < CUTS.length - 1; f++) {
    const a = Math.floor(N * CUTS[f]), b = Math.floor(N * CUTS[f + 1]);
    const tr = rows.slice(0, a), te = rows.slice(a, b);
    if (tr.length < 500 || !te.length) continue;
    const mx = mean(tr.map((r) => r.x)), my = mean(tr.map((r) => r.y));
    let sxx = 0, sxy = 0;
    for (const r of tr) { sxx += (r.x - mx) ** 2; sxy += (r.x - mx) * (r.y - my); }
    const bb = sxx ? sxy / sxx : 0, aa = my - bb * mx, base = my;
    let ssRes = 0, ssBase = 0;
    const px: number[] = [], py: number[] = [];
    for (const r of te) { const p = aa + bb * r.x; ssRes += (p - r.y) ** 2; ssBase += (base - r.y) ** 2; px.push(p); py.push(r.y); oos.push({ p, y: r.y, base }); }
    const r2 = ssBase > 0 ? 1 - ssRes / ssBase : 0, ic = spearman(px, py);
    folds.push({ r2, ic });
    console.log(`  fold${f}: n=${te.length} b=${bb.toFixed(3)} OOS-R²=${r2.toFixed(4)} rankIC=${ic.toFixed(4)}`);
  }
  let ssRes = 0, ssBase = 0;
  for (const o of oos) { ssRes += (o.p - o.y) ** 2; ssBase += (o.base - o.y) ** 2; }
  console.log(`池化 OOS-R²=${(1 - ssRes / ssBase).toFixed(4)}  每折 R²为正=${folds.filter((f) => f.r2 > 0).length}/${folds.length}  rankIC均值=${mean(folds.map((f) => f.ic)).toFixed(4)}`);
  await prisma.$disconnect();
}

main();
