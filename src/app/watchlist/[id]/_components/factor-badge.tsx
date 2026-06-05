import { getFactorRank, factorMeta } from "@/lib/factor";

/**
 * 价值+动量横截面信号徽章（服务端直读快照）。
 * 百分位 = 在参考池里"便宜(高 B/M) + 强动量"的综合排名；高=历史上跑赢同池的方向。
 * 仅命中参考池的标的显示；诚实：这是横截面相对排名，非择时、非保证。
 */
export function FactorBadge({ ticker }: { ticker: string }) {
  const rank = getFactorRank(ticker);
  if (!rank) return null;
  const meta = factorMeta();
  const p = rank.percentile;
  const tone = p >= 67 ? "bg-green-100 text-green-800" : p <= 33 ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800";
  const word = p >= 67 ? "偏强" : p <= 33 ? "偏弱" : "中性";
  const title =
    `价值+动量横截面信号（相对 ${meta.universeSize} 只参考池，asOf ${meta.asOf}）\n` +
    `百分位 ${p}/100：越高=越便宜(高账面/市值)+动量越强。\n` +
    `B/M=${rank.bm}　12-1动量=${(rank.mom * 100).toFixed(0)}%\n` +
    `历史上该方向跑赢同池（+0.91%/63d，详见 docs/factor-research.md）；横截面相对排名，非择时、非保证。`;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium ${tone}`}
      title={title}
    >
      价值+动量 {p} · {word}
    </span>
  );
}
