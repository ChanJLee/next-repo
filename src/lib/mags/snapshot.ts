/**
 * MAGS（Roundhill Magnificent Seven ETF）「抄作业」快照。
 *
 * MAGS 的方法论很简单：等权持有七姐妹、每季再平衡。所以成分是固定已知的，
 * 真正需要的信息只有：7 只 + 等权目标权重(1/7) + 下次季度再平衡日 + 当前行情。
 * 本快照即据此实时计算（行情走 Yahoo，失败则降级为只给权重与日期）。
 *
 * 定位（见记忆 mag7-rebalance-strategy）：信息参考，非买卖建议。抄 MAGS=押注巨头科技
 * 继续领跑的 beta，不是 alpha；涨赢大盘、跌也更狠。零成本下 DIY 复制可省其 0.29% 费率。
 */
import { getQuotes } from "@/lib/data/yahoo";

// MAGS 成分（等权）。成分极少变动；若 Roundhill 调整成分，改这里即可。
export const MAGS_HOLDINGS: { ticker: string; name: string }[] = [
  { ticker: "AAPL", name: "苹果 Apple" },
  { ticker: "MSFT", name: "微软 Microsoft" },
  { ticker: "GOOGL", name: "谷歌 Alphabet" },
  { ticker: "AMZN", name: "亚马逊 Amazon" },
  { ticker: "NVDA", name: "英伟达 Nvidia" },
  { ticker: "META", name: "Meta" },
  { ticker: "TSLA", name: "特斯拉 Tesla" },
];

export interface MagsHolding {
  ticker: string;
  name: string;
  price: number | null;
  changePercent: number | null;
}

export interface MagsSnapshot {
  generatedAt: string; // ISO
  targetWeightPct: number; // 等权目标 = 100/7
  nextRebalanceISO: string; // 下次季度再平衡日（季度末，approx）
  daysToRebalance: number;
  holdings: MagsHolding[];
  quotesOk: boolean; // 行情是否成功（false 时只展示权重/日期）
}

/**
 * 下次季度再平衡日：取季度末（3/6/9/12 月最后一个工作日）；已过则进入下一季度。
 * 注：MAGS 按季度再平衡，确切生效日以 Roundhill 公告为准，这里给标准季度末作参考。
 */
export function nextQuarterlyRebalance(now = new Date()): Date {
  const quarterEndMonths = [2, 5, 8, 11]; // 0-indexed: Mar/Jun/Sep/Dec
  const lastWeekdayOfMonth = (y: number, m: number): Date => {
    const d = new Date(Date.UTC(y, m + 1, 0)); // 该月最后一天
    const dow = d.getUTCDay();
    if (dow === 0) d.setUTCDate(d.getUTCDate() - 2); // 周日 → 周五
    else if (dow === 6) d.setUTCDate(d.getUTCDate() - 1); // 周六 → 周五
    return d;
  };
  const y = now.getUTCFullYear();
  const candidates = quarterEndMonths.map((m) => lastWeekdayOfMonth(y, m));
  candidates.push(lastWeekdayOfMonth(y + 1, 2)); // 跨年兜底：明年 Q1
  for (const c of candidates) if (c.getTime() >= now.getTime()) return c;
  return candidates[candidates.length - 1];
}

export async function getMagsSnapshot(): Promise<MagsSnapshot> {
  const tickers = MAGS_HOLDINGS.map((h) => h.ticker);
  let quoteMap = new Map<string, { price: number; changePercent: number }>();
  let quotesOk = false;
  try {
    const quotes = await getQuotes(tickers);
    for (const q of quotes) quoteMap.set(q.symbol.toUpperCase(), { price: q.price, changePercent: q.changePercent });
    quotesOk = quoteMap.size > 0;
  } catch {
    /* 行情失败 → 降级，只给权重与日期 */
  }

  const holdings: MagsHolding[] = MAGS_HOLDINGS.map((h) => {
    const q = quoteMap.get(h.ticker.toUpperCase());
    return { ticker: h.ticker, name: h.name, price: q?.price ?? null, changePercent: q?.changePercent ?? null };
  });

  const now = new Date();
  const next = nextQuarterlyRebalance(now);
  return {
    generatedAt: now.toISOString(),
    targetWeightPct: 100 / MAGS_HOLDINGS.length,
    nextRebalanceISO: next.toISOString(),
    daysToRebalance: Math.ceil((next.getTime() - now.getTime()) / 86400_000),
    holdings,
    quotesOk,
  };
}
