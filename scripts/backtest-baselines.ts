/**
 * 探查「哪种方向/周期」在样本外真有边际。
 * 全部点-时计算（只用 t 之前的 closes），对比多个简单信号在多个预测窗口下的 AUC。
 *
 * 信号（z = 标准化后的状态，>0 表示偏强/偏高）：
 *   mom20  : 20 日动量    —— 趋势跟随（z 越大越看多）
 *   mom60  : 60 日动量    —— 趋势跟随
 *   ext20  : 距 20 日均线乖离 —— 反转（z 越大越看空，取负）
 *   rsi14  : RSI          —— 反转（越高越看空，取负）
 * 预测标签：未来 H 日收盘价更高。
 */
import { prisma } from "../src/lib/db";
import { hurstExponent } from "../src/app/watchlist/[id]/_components/market-model";

const HORIZONS = [5, 10, 20, 40];
const MIN_T = 120;

function mean(a: number[]) {
  return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
}
function vol(closes: number[], i: number, p = 20) {
  if (i < p) return 0.02;
  const r: number[] = [];
  for (let j = i - p + 1; j <= i; j++) if (closes[j - 1] > 0) r.push(Math.log(closes[j] / closes[j - 1]));
  const m = mean(r);
  return Math.max(0.005, Math.sqrt(mean(r.map((x) => (x - m) ** 2))));
}
function momZ(closes: number[], i: number, lb: number) {
  if (i < lb) return 0;
  return Math.log(closes[i] / closes[i - lb]) / (vol(closes, i) * Math.sqrt(lb));
}
function extZ(closes: number[], i: number, p: number) {
  if (i < p) return 0;
  const ma = mean(closes.slice(i - p + 1, i + 1));
  return Math.log(closes[i] / ma) / (vol(closes, i) * Math.sqrt(p / 5));
}
function rsiZ(closes: number[], i: number, p = 14) {
  if (i < p) return 0;
  let g = 0, l = 0;
  for (let j = i - p + 1; j <= i; j++) {
    const d = closes[j] - closes[j - 1];
    if (d >= 0) g += d; else l -= d;
  }
  if (g === 0 && l === 0) return 0;
  const rs = l === 0 ? 100 : g / l;
  return ((100 - 100 / (1 + rs)) - 50) / 25;
}

function auc(scores: number[], labels: number[]): number {
  const idx = scores.map((_, i) => i).sort((a, b) => scores[a] - scores[b]);
  let rankSum = 0, pos = 0;
  const neg = labels.filter((l) => l === 0).length;
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j < idx.length && scores[idx[j]] === scores[idx[i]]) j++;
    const avgRank = (i + j - 1) / 2 + 1;
    for (let k = i; k < j; k++) if (labels[idx[k]] === 1) { rankSum += avgRank; pos++; }
    i = j;
  }
  if (pos === 0 || neg === 0) return 0.5;
  return (rankSum - (pos * (pos + 1)) / 2) / (pos * neg);
}

async function main() {
  const symbols = await prisma.symbol.findMany({ include: { strategies: false, candles: { orderBy: { date: "asc" } } } });
  for (const s of symbols) {
    const closes = s.candles.map((c) => c.close);
    const n = closes.length;
    if (n < 300) { console.log(`[${s.ticker}] 跳过 candles=${n}`); continue; }

    // 状态条件化：趋势态(Hurst>0.5)顺动量，震荡态(<0.5)反动量。用点-时 Hurst。
    const hurstCache = new Map<number, number>();
    const hurstAt = (i: number) => {
      if (!hurstCache.has(i)) hurstCache.set(i, hurstExponent(closes.slice(0, i + 1)) ?? 0.5);
      return hurstCache.get(i)!;
    };
    const signals = {
      mom20: (i: number) => momZ(closes, i, 20),
      mom60: (i: number) => momZ(closes, i, 60),
      ext20_contra: (i: number) => -extZ(closes, i, 20),
      rsi14_contra: (i: number) => -rsiZ(closes, i),
      regime_mom20: (i: number) => Math.sign(hurstAt(i) - 0.5) * momZ(closes, i, 20),
    };

    const lines: Record<string, number[]> = {};
    for (const H of HORIZONS) {
      const labels: number[] = [];
      const scores: Record<string, number[]> = {};
      for (const key of Object.keys(signals)) scores[key] = [];
      for (let i = MIN_T; i <= n - 1 - H; i++) {
        labels.push(closes[i + H] > closes[i] ? 1 : 0);
        for (const [key, fn] of Object.entries(signals)) scores[key].push(fn(i));
      }
      for (const key of Object.keys(signals)) {
        (lines[key] ??= []).push(+auc(scores[key], labels).toFixed(3));
      }
    }
    console.log(`\n[${s.ticker}] n=${n}  AUC by horizon ${JSON.stringify(HORIZONS)}`);
    for (const [key, arr] of Object.entries(lines)) console.log(`  ${key.padEnd(14)} ${JSON.stringify(arr)}`);
  }
  await prisma.$disconnect();
}

main();
