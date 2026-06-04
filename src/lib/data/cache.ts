import { prisma } from "@/lib/db";
import { getDailyCandles, getQuotes, type Candle, type Quote } from "@/lib/data/yahoo";
import { getDailyCandlesFromStooq } from "@/lib/data/stooq";
import { getDailyCandlesFromYahooChart } from "@/lib/data/yahoo-chart";
import { isMarketOpen } from "@/lib/market/hours";

// TTL（毫秒）—— 盘中收紧，闭市放宽以减少对外部接口的请求频率
function candleTTL(): number {
  return isMarketOpen() ? 5 * 60_000 : 60 * 60_000;
}
function quoteTTL(): number {
  return isMarketOpen() ? 60_000 : 5 * 60_000;
}

export type CandleSource = "stooq" | "yahoo-chart" | "yahoo";

/**
 * 多数据源拉日线（按可靠性排序，Stooq 在云 IP 下更稳）：
 *   1. Stooq CSV（首选，需要 apikey 限额更高；无 key 也能调但更易限流）
 *   2. Yahoo chart 公开接口（兜底；Vercel/AWS IP 段经常被 Yahoo 软封锁）
 *   3. yahoo-finance2 v3 historical（最终兜底）
 */
async function fetchCandlesFromAny(
  ticker: string,
  days: number,
  stooqApikey?: string,
): Promise<{ candles: Candle[]; source: CandleSource }> {
  const errors: string[] = [];
  try {
    const candles = await getDailyCandlesFromStooq(ticker, days, stooqApikey);
    if (candles.length > 0) return { candles, source: "stooq" };
    errors.push("stooq: empty");
  } catch (e) {
    errors.push(`stooq: ${e instanceof Error ? e.message : e}`);
  }
  try {
    const candles = await getDailyCandlesFromYahooChart(ticker, days);
    if (candles.length > 0) return { candles, source: "yahoo-chart" };
    errors.push("yahoo-chart: empty");
  } catch (e) {
    errors.push(`yahoo-chart: ${e instanceof Error ? e.message : e}`);
  }
  try {
    const candles = await getDailyCandles(ticker, days);
    if (candles.length > 0) return { candles, source: "yahoo" };
    errors.push("yahoo-v2: empty");
  } catch (e) {
    errors.push(`yahoo-v2: ${e instanceof Error ? e.message : e}`);
  }
  throw new Error(`所有数据源都失败: ${errors.join("; ")}`);
}

// ---- 市场参考序列（SPY 等，不入库）----------------------------------------
// 跨资产特征需要大盘序列，但它不是 watchlist 标的、不该污染 Symbol/Candle 表。
// 这里走进程内 TTL 缓存（热实例复用、冷启动重拉），按 ticker+days 记忆。
const marketMemo = new Map<string, { at: number; candles: Candle[] }>();

/** 拉市场参考 K 线（如 SPY），无 DB 缓存，仅进程内 TTL 记忆。 */
export async function getMarketCandles(ticker: string, days: number, stooqApikey?: string): Promise<Candle[]> {
  const key = `${ticker}:${days}`;
  const hit = marketMemo.get(key);
  if (hit && Date.now() - hit.at < candleTTL()) return hit.candles;
  const { candles } = await fetchCandlesFromAny(ticker, days, stooqApikey);
  marketMemo.set(key, { at: Date.now(), candles });
  return candles;
}

/**
 * 把日期归一到 UTC 零点。各数据源给同一交易日打的时间戳不一致
 * （Stooq 用 UTC 零点、yahoo-chart 用盘中时刻），不归一会让 @@id([symbolId,date])
 * 把同一天当成多行，累积重复数据并把图表打挂。
 */
function toUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

// 一次最近多少根用 upsert 兜底更新（盘中/最新一根 OHLC 会变）；
// 其余历史根是不可变的，走批量 createMany 一条语句插入，避免上千次单条往返。
const RECENT_UPSERT = 5;

async function upsertCandles(symbolId: number, candles: Candle[]): Promise<{ inserted: number; updated: number }> {
  if (candles.length === 0) return { inserted: 0, updated: 0 };
  // 同一批里若有同一天的多条，按日归并保留最后一条
  const byDay = new Map<number, Candle>();
  for (const c of candles) {
    const day = toUtcDay(c.date);
    byDay.set(day.getTime(), { ...c, date: day });
  }
  const rows = Array.from(byDay.values()).sort((a, b) => a.date.getTime() - b.date.getTime());

  // 查已存在的日期，只 createMany 新增的（libSQL 上批量插入是单条语句，远快于逐条 upsert）
  const existing = await prisma.candle.findMany({
    where: { symbolId, date: { in: rows.map((r) => r.date) } },
    select: { date: true },
  });
  const have = new Set(existing.map((e) => e.date.getTime()));
  const toInsert = rows.filter((r) => !have.has(r.date.getTime()));
  if (toInsert.length > 0) {
    await prisma.candle.createMany({
      data: toInsert.map((c) => ({ symbolId, date: c.date, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume })),
    });
  }

  // 仅对最近几根做 upsert，捕捉最新一根的盘中变化（历史根不变，无需更新）
  const recent = rows.slice(-RECENT_UPSERT).filter((r) => have.has(r.date.getTime()));
  if (recent.length > 0) {
    await prisma.$transaction(
      recent.map((c) =>
        prisma.candle.upsert({
          where: { symbolId_date: { symbolId, date: c.date } },
          update: { open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume },
          create: { symbolId, date: c.date, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume },
        }),
      ),
    );
  }
  return { inserted: toInsert.length, updated: recent.length };
}

/**
 * 全量替换某标的的全部 K 线（用于「回填历史」按钮）。
 * 整段 delete + createMany，使复权因子的变化（拆股/分红后）能重新作用到所有历史根，
 * 而不像增量 upsert 那样只补缺失。数据异常少（<50 根）时退回增量，避免误清库。
 */
async function replaceAllCandles(symbolId: number, candles: Candle[]): Promise<{ deleted: number; inserted: number }> {
  const byDay = new Map<number, Candle>();
  for (const c of candles) {
    if (![c.open, c.high, c.low, c.close].every((v) => Number.isFinite(v) && v > 0)) continue;
    const day = toUtcDay(c.date);
    byDay.set(day.getTime(), { ...c, date: day });
  }
  const rows = Array.from(byDay.values()).sort((a, b) => a.date.getTime() - b.date.getTime());
  if (rows.length < 50) {
    const { inserted } = await upsertCandles(symbolId, rows);
    return { deleted: 0, inserted };
  }
  const before = await prisma.candle.count({ where: { symbolId } });
  await prisma.$transaction([
    prisma.candle.deleteMany({ where: { symbolId } }),
    prisma.candle.createMany({
      data: rows.map((c) => ({ symbolId, date: c.date, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume })),
    }),
  ]);
  return { deleted: before, inserted: rows.length };
}

interface CacheCandlesOpts {
  symbolId: number;
  ticker: string;
  days: number;
  force?: boolean;
  stooqApikey?: string;
}

/**
 * 获取 K 线 —— 优先用 DB 缓存，过期/不足时再向数据源拉。
 * 拉到的数据会 upsert 回缓存。失败时若有旧缓存则降级返回旧数据。
 */
export async function getCandlesCached({ symbolId, ticker, days, force, stooqApikey }: CacheCandlesOpts): Promise<Candle[]> {
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
    const { candles } = await fetchCandlesFromAny(ticker, days, stooqApikey);
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
 * replace=true 时整段复权替换（「回填历史」按钮用，拉全量并重新复权）；
 * 否则增量 upsert（仅补缺失 + 更新最近几根）。
 */
export async function backfillCandles(
  symbolId: number,
  ticker: string,
  days: number = 730,
  stooqApikey?: string,
  replace = false,
): Promise<{ inserted: number; updated: number; fetched: number; source: CandleSource; replaced: boolean }> {
  const { candles, source } = await fetchCandlesFromAny(ticker, days, stooqApikey);
  if (replace) {
    const { deleted, inserted } = await replaceAllCandles(symbolId, candles);
    return { inserted, updated: deleted, fetched: candles.length, source, replaced: true };
  }
  const { inserted, updated } = await upsertCandles(symbolId, candles);
  return { inserted, updated, fetched: candles.length, source, replaced: false };
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
