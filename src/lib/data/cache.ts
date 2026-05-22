import { prisma } from "@/lib/db";
import { getDailyCandles, getQuotes, type Candle, type Quote } from "@/lib/data/yahoo";
import { getDailyCandlesFromStooq } from "@/lib/data/stooq";
import { isMarketOpen } from "@/lib/market/hours";

// TTL（毫秒）—— 盘中收紧，闭市放宽以减少对外部接口的请求频率
function candleTTL(): number {
  return isMarketOpen() ? 5 * 60_000 : 60 * 60_000;
}
function quoteTTL(): number {
  return isMarketOpen() ? 60_000 : 5 * 60_000;
}

export type CandleSource = "stooq" | "yahoo";

/**
 * 多数据源拉日线：Stooq 优先（无 API Key，限流宽松），失败时退回 yahoo。
 */
async function fetchCandlesFromAny(
  ticker: string,
  days: number,
): Promise<{ candles: Candle[]; source: CandleSource }> {
  try {
    const candles = await getDailyCandlesFromStooq(ticker, days);
    if (candles.length > 0) return { candles, source: "stooq" };
    throw new Error("stooq empty");
  } catch (stooqErr) {
    try {
      const candles = await getDailyCandles(ticker, days);
      return { candles, source: "yahoo" };
    } catch (yahooErr) {
      throw new Error(
        `所有数据源都失败: stooq=${stooqErr instanceof Error ? stooqErr.message : stooqErr}; yahoo=${yahooErr instanceof Error ? yahooErr.message : yahooErr}`,
      );
    }
  }
}

async function upsertCandles(symbolId: number, candles: Candle[]): Promise<void> {
  if (candles.length === 0) return;
  await prisma.$transaction(
    candles.map((c) =>
      prisma.candle.upsert({
        where: { symbolId_date: { symbolId, date: c.date } },
        update: { open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume },
        create: { symbolId, date: c.date, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume },
      }),
    ),
  );
}

interface CacheCandlesOpts {
  symbolId: number;
  ticker: string;
  days: number;
  force?: boolean;
}

/**
 * 获取 K 线 —— 优先用 DB 缓存，过期/不足时再向数据源拉。
 * 拉到的数据会 upsert 回缓存。失败时若有旧缓存则降级返回旧数据。
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
        return cached.map(toCandle);
      }
    }
  }

  try {
    const { candles } = await fetchCandlesFromAny(ticker, days);
    await upsertCandles(symbolId, candles);
    return candles;
  } catch (e) {
    // 拉取失败时降级到缓存（哪怕过期）
    const fallback = await prisma.candle.findMany({
      where: { symbolId, date: { gte: since } },
      orderBy: { date: "asc" },
    });
    if (fallback.length > 0) return fallback.map(toCandle);
    throw e;
  }
}

function toCandle(c: {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}): Candle {
  return { date: c.date, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume };
}

/**
 * 主动预填充：把指定股票的多年历史一次性灌入数据库。
 */
export async function backfillCandles(
  symbolId: number,
  ticker: string,
  days: number = 730,
): Promise<{ inserted: number; source: CandleSource }> {
  const { candles, source } = await fetchCandlesFromAny(ticker, days);
  await upsertCandles(symbolId, candles);
  return { inserted: candles.length, source };
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
    if (cachedIds.size === symbols.length) return result;
  }

  const missing = symbols.filter((s) => !result.has(s.ticker));
  if (missing.length === 0) return result;

  let fresh: Quote[];
  try {
    fresh = await getQuotes(missing.map((s) => s.ticker));
  } catch (e) {
    // 报价 API 失败时，用 K 线缓存的最新一根降级（仅 price/changePercent，volume 用日线）
    for (const s of missing) {
      const last = await prisma.candle.findFirst({
        where: { symbolId: s.id },
        orderBy: { date: "desc" },
      });
      const prev = last
        ? await prisma.candle.findFirst({
            where: { symbolId: s.id, date: { lt: last.date } },
            orderBy: { date: "desc" },
          })
        : null;
      if (last) {
        result.set(s.ticker, {
          symbol: s.ticker,
          price: last.close,
          previousClose: prev?.close ?? last.close,
          changePercent: prev ? ((last.close - prev.close) / prev.close) * 100 : 0,
          volume: last.volume,
          marketState: "FALLBACK",
        });
      }
    }
    if (result.size === symbols.length) return result;
    throw e;
  }

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
