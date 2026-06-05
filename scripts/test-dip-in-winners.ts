/**
 * 检验「在赢家股里抄回调」——用户的真实策略（只做赢家股）。
 *
 * 与"接飞刀"严格区分，全程 point-in-time（无前视）：
 *   · 赢家(winner) = 价 > 200日均线 且 12-1月动量 > 0（纯过去数据定义的上升趋势）。
 *   · 回调(dip)    = 价低于 20日均线 ≥ X%（短期超卖）。
 *   · 度量：赢家里「回调 vs 不回调」的未来 H 日收益差 edge（抄回调若有用 → 回调后收益更高）。
 *   · 对照：输家(价<200线)里抄回调（接飞刀）应更差/无效。
 *   · 显著性：按【日期分块】自助 95% CI。
 *
 * 用法：pnpm exec tsx scripts/test-dip-in-winners.ts [取样日=600] [步长=3] [H=21] [回调阈%=3] [B=2000]
 */
import { prisma } from "../src/lib/db";
import { mulberry32 } from "./_fitlib";
import type { Candle } from "../src/lib/data/yahoo";

const MAX = Number(process.argv[2] ?? 600);
const STEP = Math.max(1, Number(process.argv[3] ?? 3));
const H = Number(process.argv[4] ?? 21);
const DIP = Number(process.argv[5] ?? 3) / 100; // 低于 20 日线多少算回调
const B = Number(process.argv[6] ?? 2000);
const MA_LONG = 200, MA_SHORT = 20, FORM_LONG = 252, FORM_SKIP = 21, MIN_BARS = 320;

const ma = (c: Candle[], i: number, w: number) => { let s = 0; for (let j = i - w + 1; j <= i; j++) s += c[j].close; return s / w; };

interface Obs { date: string; group: "winDip" | "winNo" | "loseDip" | "loseNo"; fwd: number }

async function main() {
  // 从 DB 读 watchlist 全历史 K 线（即用户实际交易的赢家股），免抓取
  const symbols = await prisma.symbol.findMany({ include: { candles: { orderBy: { date: "asc" } } } });
  const data = symbols
    .map((s) => ({ ticker: s.ticker, c: s.candles.map((x) => ({ date: x.date, open: x.open, high: x.high, low: x.low, close: x.close, volume: x.volume })) as Candle[], idx: new Map<string, number>() }))
    .filter((d) => d.c.length >= MIN_BARS);
  for (const d of data) d.c.forEach((x, i) => d.idx.set(x.date.toISOString().slice(0, 10), i));
  console.log(`DB 标的 ${data.length}：${data.map((d) => d.ticker).join(", ")}`);
  const allDates = [...new Set(data.flatMap((s) => s.c.map((x) => x.date.toISOString().slice(0, 10))))].sort();
  const sampleDates = allDates.slice(-MAX * STEP).filter((_, k) => k % STEP === 0);
  console.log(`\n标的 ${data.length}  取样日 ${sampleDates.length}  H=${H}  回调阈 ${(DIP * 100).toFixed(0)}%`);

  const obs: Obs[] = [];
  for (const s of data) {
    for (const d of sampleDates) {
      const i = s.idx.get(d);
      if (i == null || i < FORM_LONG || i + H >= s.c.length) continue;
      const px = s.c[i].close;
      const winner = px > ma(s.c, i, MA_LONG) && (s.c[i - FORM_LONG].close > 0 && s.c[i - FORM_SKIP].close / s.c[i - FORM_LONG].close - 1 > 0);
      const dip = px < ma(s.c, i, MA_SHORT) * (1 - DIP);
      const fwd = s.c[i + H].close / px - 1;
      obs.push({ date: d, group: winner ? (dip ? "winDip" : "winNo") : (dip ? "loseDip" : "loseNo"), fwd });
    }
  }

  const rng = mulberry32(1);
  const meanFwd = (g: Obs[]) => g.reduce((a, o) => a + o.fwd, 0) / (g.length || 1);
  const upr = (g: Obs[]) => g.filter((o) => o.fwd > 0).length / (g.length || 1);
  const byDate = new Map<string, Obs[]>(); for (const o of obs) (byDate.get(o.date) ?? byDate.set(o.date, []).get(o.date)!).push(o);
  const dates = [...byDate.keys()];
  const pct = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(2)}%`;

  function edgeCI(a: Obs["group"], b: Obs["group"], label: string) {
    const ga = obs.filter((o) => o.group === a), gb = obs.filter((o) => o.group === b);
    const edge = meanFwd(ga) - meanFwd(gb);
    const boot: number[] = [];
    for (let t = 0; t < B; t++) {
      const samp: Obs[] = []; for (let k = 0; k < dates.length; k++) samp.push(...byDate.get(dates[Math.floor(rng() * dates.length)])!);
      const sa = samp.filter((o) => o.group === a), sb = samp.filter((o) => o.group === b);
      if (sa.length && sb.length) boot.push(meanFwd(sa) - meanFwd(sb));
    }
    boot.sort((x, y) => x - y);
    const lo = boot[Math.floor(0.025 * boot.length)], hi = boot[Math.floor(0.975 * boot.length)];
    const v = lo > 0 ? "✅ 显著为正" : hi < 0 ? "✅ 显著为负" : "❌ 跨0";
    console.log(`  ${label}: edge=${pct(edge)}/${H}d  CI=[${pct(lo)},${pct(hi)}]  ${v}  (n=${ga.length} vs ${gb.length})`);
  }

  console.log("\n各组未来收益（均值 / 上涨率 / 样本数）：");
  for (const g of ["winDip", "winNo", "loseDip", "loseNo"] as const) {
    const arr = obs.filter((o) => o.group === g);
    console.log(`  ${g.padEnd(8)} 均值=${pct(meanFwd(arr))}  上涨率=${(upr(arr) * 100).toFixed(1)}%  n=${arr.length}`);
  }
  console.log("\n核心检验（按日期分块 CI）：");
  edgeCI("winDip", "winNo", "赢家里：回调 vs 不回调（抄回调有用吗）");
  edgeCI("winDip", "loseDip", "回调里：赢家 vs 输家（只抄赢家的回调对吗）");
  await prisma.$disconnect().catch(() => {});
}

main();
