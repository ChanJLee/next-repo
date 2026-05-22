import yahooFinance from "yahoo-finance2";

yahooFinance.suppressNotices(["yahooSurvey"]);

export interface Quote {
  symbol: string;
  price: number;
  previousClose: number;
  changePercent: number;
  volume: number;
  marketState?: string;
}

export interface Candle {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export async function getQuotes(tickers: string[]): Promise<Quote[]> {
  if (tickers.length === 0) return [];
  const raw = await yahooFinance.quote(tickers, {}, { validateResult: false });
  const arr = Array.isArray(raw) ? raw : [raw];
  return arr
    .filter((q): q is NonNullable<typeof q> => !!q && typeof q.regularMarketPrice === "number")
    .map((q) => ({
      symbol: q.symbol,
      price: q.regularMarketPrice as number,
      previousClose: (q.regularMarketPreviousClose ?? q.regularMarketPrice) as number,
      changePercent: (q.regularMarketChangePercent ?? 0) as number,
      volume: (q.regularMarketVolume ?? 0) as number,
      marketState: q.marketState,
    }));
}

/**
 * 获取近 N 个交易日的日线 K 线，用于计算 MA/RSI/MACD/成交量均值。
 */
export async function getDailyCandles(ticker: string, days = 120): Promise<Candle[]> {
  const period2 = new Date();
  const period1 = new Date();
  period1.setDate(period1.getDate() - Math.ceil(days * 1.6) - 7); // 留余量给非交易日

  const rows = await yahooFinance.historical(ticker, {
    period1,
    period2,
    interval: "1d",
  });

  return rows
    .filter((r) => r.close != null && r.open != null)
    .map((r) => ({
      date: r.date,
      open: r.open as number,
      high: r.high as number,
      low: r.low as number,
      close: r.close as number,
      volume: r.volume ?? 0,
    }));
}
