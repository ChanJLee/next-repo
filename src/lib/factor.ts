/**
 * 价值+动量横截面信号（运行时只读 committed 快照，零外部依赖）。
 * 快照由 scripts/build-factor-snapshot.ts 周期性离线生成。
 * 百分位越高 = 越便宜（高 B/M）+ 动量越强 —— 历史上跑赢同池的方向（见 docs/factor-research.md）。
 */
import snapshot from "@/lib/data/factor-snapshot.json";

export interface FactorRank {
  ticker: string;
  bm: number;
  mom: number;
  composite: number;
  percentile: number; // 0–100
}

const byTicker = new Map<string, FactorRank>();
for (const it of (snapshot.items as FactorRank[])) byTicker.set(it.ticker.toUpperCase(), it);

export function getFactorRank(ticker: string): FactorRank | null {
  return byTicker.get(ticker.toUpperCase()) ?? null;
}

export function factorMeta(): { asOf: string; universeSize: number; factor: string } {
  return { asOf: snapshot.asOf, universeSize: snapshot.universeSize, factor: snapshot.factor };
}
