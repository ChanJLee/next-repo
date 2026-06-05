/**
 * 基本面因子横截面检验：读 featurize-fundamentals 的缓存，按单因子或组合排名，
 * 测高分组−低分组的未来收益 spread，按日期分块自助给 95% CI（CI 排除 0 才算真）。
 * point-in-time（基本面已是 filed≤d）、无参数拟合。
 *
 * 用法：pnpm exec tsx scripts/test-fund-factors.ts [cache=fund-cache.json] [factor] [B=2000]
 *   factor ∈ bm|ep|roe|gpa|mom|value|quality|composite|all（默认 all）
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { mulberry32 } from "./_fitlib";

const CACHE = process.argv[2] ?? "fund-cache.json";
const WHICH = process.argv[3] ?? "all";
const B = Number(process.argv[4] ?? 2000);
const MIN_SYMBOLS = 10;
const IDX = { bm: 0, ep: 1, roe: 2, gpa: 3, mom: 4 } as const;

interface Row { sym: string; date: string; f: (number | null)[]; fwd: number }
const cache = JSON.parse(readFileSync(join(process.cwd(), "data", CACHE), "utf8")) as { horizon: number; rows: Row[] };

// 信号定义：返回该 row 用到的因子下标集合 + 由这些因子算 signal（已 z-score 的传入）
type Spec = { name: string; use: number[]; combine: (z: number[]) => number };
const SPECS: Record<string, Spec> = {
  bm: { name: "bm 价值(账面/市值)", use: [IDX.bm], combine: (z) => z[0] },
  ep: { name: "ep 盈利收益率", use: [IDX.ep], combine: (z) => z[0] },
  roe: { name: "roe 质量", use: [IDX.roe], combine: (z) => z[0] },
  gpa: { name: "gpa 毛利/资产 质量", use: [IDX.gpa], combine: (z) => z[0] },
  mom: { name: "mom 12-1动量", use: [IDX.mom], combine: (z) => z[0] },
  value: { name: "value=z(bm)+z(ep)", use: [IDX.bm, IDX.ep], combine: (z) => z[0] + z[1] },
  quality: { name: "quality=z(roe)+z(gpa)", use: [IDX.roe, IDX.gpa], combine: (z) => z[0] + z[1] },
  composite: { name: "composite=value+quality+mom", use: [IDX.bm, IDX.ep, IDX.roe, IDX.gpa, IDX.mom], combine: (z) => z.reduce((a, b) => a + b, 0) },
  valmom: { name: "valmom=z(bm)+z(mom)", use: [IDX.bm, IDX.mom], combine: (z) => z[0] + z[1] },
  valmomQ: { name: "valmom-quality=z(bm)+z(mom)-z(roe)", use: [IDX.bm, IDX.mom, IDX.roe], combine: (z) => z[0] + z[1] - z[2] },
  valmomQ2: { name: "z(bm)+z(mom)-z(roe)-z(gpa)", use: [IDX.bm, IDX.mom, IDX.roe, IDX.gpa], combine: (z) => z[0] + z[1] - z[2] - z[3] },
};

function byDate(rows: Row[]): Map<string, Row[]> {
  const m = new Map<string, Row[]>();
  for (const r of rows) (m.get(r.date) ?? m.set(r.date, []).get(r.date)!).push(r);
  return m;
}

function dayStats(spec: Spec): { date: string; spread: number }[] {
  const out: { date: string; spread: number }[] = [];
  for (const [date, rows] of byDate(cache.rows)) {
    const valid = rows.filter((r) => spec.use.every((k) => r.f[k] != null && Number.isFinite(r.f[k]!)));
    if (valid.length < MIN_SYMBOLS) continue;
    // 每个用到的因子做当日截面 z-score
    const zcols = spec.use.map((k) => {
      const v = valid.map((r) => r.f[k]!);
      const m = v.reduce((a, b) => a + b, 0) / v.length;
      const sd = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length) || 1;
      return v.map((x) => (x - m) / sd);
    });
    const sig = valid.map((_, r) => spec.combine(zcols.map((col) => col[r])));
    const order = valid.map((_, r) => r).sort((a, b) => sig[a] - sig[b]);
    const half = Math.floor(order.length / 2);
    const fwdOf = (idx: number[]) => idx.reduce((a, r) => a + valid[r].fwd, 0) / idx.length;
    const spread = fwdOf(order.slice(order.length - half)) - fwdOf(order.slice(0, half));
    out.push({ date, spread });
  }
  return out;
}

function report(key: string, rng: () => number) {
  const spec = SPECS[key];
  const days = dayStats(spec);
  if (days.length < 20) { console.log(`  ${spec.name}: 样本日不足(${days.length})`); return; }
  const mean = days.reduce((a, d) => a + d.spread, 0) / days.length;
  const boot: number[] = [];
  for (let b = 0; b < B; b++) {
    let s = 0;
    for (let k = 0; k < days.length; k++) s += days[Math.floor(rng() * days.length)].spread;
    boot.push(s / days.length);
  }
  boot.sort((a, b) => a - b);
  const lo = boot[Math.floor(0.025 * B)], hi = boot[Math.floor(0.975 * B)];
  const pPos = boot.filter((x) => x > 0).length / B;
  const pct = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(2)}%`;
  const verdict = lo > 0 ? "✅ 显著为正" : hi < 0 ? "✅ 显著为负(反)" : "❌ 跨0";
  console.log(`  ${spec.name.padEnd(26)} spread=${pct(mean)}/${cache.horizon}d  CI=[${pct(lo)},${pct(hi)}]  P>0=${(pPos * 100).toFixed(0)}%  ${verdict}  (${days.length}日)`);
  if (WHICH !== "all") {
    // 时间稳健性：按日期顺序三等分，看每段 spread（是否跨 regime 稳定）
    const sorted = [...days].sort((a, b) => (a.date < b.date ? -1 : 1));
    const seg = Math.floor(sorted.length / 3);
    for (let s = 0; s < 3; s++) {
      const part = sorted.slice(s * seg, s === 2 ? sorted.length : (s + 1) * seg);
      const m = part.reduce((a, d) => a + d.spread, 0) / part.length;
      console.log(`       段${s + 1} ${part[0].date}~${part[part.length - 1].date}: ${pct(m)}`);
    }
  }
}

function main() {
  console.log(`基本面因子检验  缓存=${CACHE}  H=${cache.horizon}  行=${cache.rows.length}\n`);
  const rng = mulberry32(1);
  const keys = WHICH === "all" ? Object.keys(SPECS) : [WHICH];
  for (const k of keys) report(k, rng);
  console.log("\n（spread=高分组−低分组未来收益；价值/质量/动量同向应为正）");
}

main();
