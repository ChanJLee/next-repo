import { prisma } from "@/lib/db";
import { getDailyCandles, getQuotes, type Candle, type Quote } from "@/lib/data/yahoo";
import { isMarketOpen } from "@/lib/market/hours";

// TTL（毫秒）—— 盘中收紧，闭市放宽以减少对 yahoo 的请求频率
function candleTTL(): number {
  return isMarketOpen() ? 5 * 60_000 : 60 * 60_000;
}
function quoteTTL(): number {
  return isMarketOpen() ? 60_000 : 5 * 60_000;
}

interface CacheCandlesOpts {
  symbolId: number;
  ticker: string;
  days: number;
  force?: boolean;
}

/**
 * 获取 K 线 —— 优先用 DB 缓存，过期/不足时再向 yahoo 拉。
 * 拉到的数据会 upsert 回缓存。
 */
export async function getCandlesCached({ symbolId, ticker, days, force }: CacheCandlesOpts): Promise<Candle[]> {
  const since = new Date(Date.now() - days * 86400_000);

  if (!force) {
    const cached = await prisma.candle.findMany({
      where: { symbolId, date: { gte: since } },
      orderBy: { date: "asc" },
    });
    if (cached.length > 0) {
      const newest = cached[cached.length - 1];
      const stalenessMs = Date.now() - newest.updatedAt.getTime();
      if (stalenessMs < candleTTL()) {
        return cached.map((c) => ({
          date: c.date,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume,
        }));
      }
    }
  }

  let fresh: Candle[];
  try {
    fresh = await getDailyCandles(ticker, days);
  } catch (e) {
    // 拉取失败时降级到缓存
    const fallback = await prisma.candle.findMany({
      where: { symbolId, date: { gte: since } },
      orderBy: { date: "asc" },
    });
    if (fallback.length > 0) {
      return fallback.map((c) => ({
        date: c.date,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      }));
    }
    throw e;
  }

  if (fresh.length > 0) {
    await prisma.$transaction(
      fresh.map((c) =>
        prisma.candle.upsert({
          where: { symbolId_date: { symbolId, date: c.date } },
          update: { open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume },
          create: { symbolId, date: c.date, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume },
        }),
      ),
    );
  }
  return fresh;
}

/**
 * 批量获取报价 —— 缓存命中的直接复用，过期的合并成一次 yahoo 请求。
 */
export async function getQuotesCached(
  symbols: { id: number; ticker: string }[],
  opts: { force?: boolean } = {},
): Promise<Map<string, Quote>> {
  const result = new Map<string, Quote>();
  const ttl = quoteTTL();
  const cutoff = new Date(Date.now() - ttl);

  if (!opts.force) {
    const cached = await prisma.quoteCache.findMany({
      where: { symbolId: { in: symbols.map((s) => s.id) }, fetchedAt: { gt: cutoff } },
    });
    const cachedIds = new Set(cached.map((c) => c.symbolId));
    for (const c of cached) {
      const sym = symbols.find((s) => s.id === c.symbolId);
      if (!sym) continue;
      result.set(sym.ticker, {
        symbol: sym.ticker,
        price: c.price,
        previousClose: c.previousClose,
        changePercent: c.changePercent,
        volume: c.volume,
        marketState: c.marketState ?? undefined,
      });
    }
    // 全命中直接返回
    if (cachedIds.size === symbols.length) return result;
  }

  const missing = symbols.filter((s) => !result.has(s.ticker));
  if (missing.length === 0) return result;

  const fresh = await getQuotes(missing.map((s) => s.ticker));
  const now = new Date();

  for (const q of fresh) {
    const sym = missing.find((s) => s.ticker === q.symbol);
    if (!sym) continue;
    result.set(q.symbol, q);
    await prisma.quoteCache.upsert({
      where: { symbolId: sym.id },
      update: {
        price: q.price,
        previousClose: q.previousClose,
        changePercent: q.changePercent,
        volume: q.volume,
        marketState: q.marketState,
        fetchedAt: now,
      },
      create: {
        symbolId: sym.id,
        price: q.price,
        previousClose: q.previousClose,
        changePercent: q.changePercent,
        volume: q.volume,
        marketState: q.marketState,
        fetchedAt: now,
      },
    });
  }
  return result;
}
