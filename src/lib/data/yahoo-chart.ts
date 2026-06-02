import type { Candle } from "./yahoo";

/**
 * 直接调用 Yahoo Finance 公开 chart 接口（不走 yahoo-finance2 包，
 * 因为 v2 用的 historical CSV 接口已停服 / 加 cookie 校验）。
 * 这个接口不要 API Key，需要带浏览器 UA。
 */
const YAHOO_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

interface YahooChartResp {
  chart?: {
    result?: Array<{
      meta?: { symbol?: string; regularMarketPrice?: number };
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          open?: (number | null)[];
          high?: (number | null)[];
          low?: (number | null)[];
          close?: (number | null)[];
          volume?: (number | null)[];
        }>;
        adjclose?: Array<{ adjclose?: (number | null)[] }>;
      };
    }>;
    error?: { code?: string; description?: string } | null;
  };
}

function rangeForDays(days: number): string {
  if (days <= 5) return "5d";
  if (days <= 30) return "1mo";
  if (days <= 90) return "3mo";
  if (days <= 180) return "6mo";
  if (days <= 365) return "1y";
  if (days <= 730) return "2y";
  if (days <= 1825) return "5y";
  if (days <= 3650) return "10y";
  return "max";
}

export async function getDailyCandlesFromYahooChart(ticker: string, days: number = 365): Promise<Candle[]> {
  const range = rangeForDays(days);
  // events=div|split 让接口附带复权所需的 adjclose（拆股+分红调整后的收盘价）。
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${range}&interval=1d&events=div%7Csplit`;
  const res = await fetch(url, {
    headers: { "User-Agent": YAHOO_UA, Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Yahoo chart HTTP ${res.status}`);

  const data = (await res.json()) as YahooChartResp;
  if (data.chart?.error) throw new Error(`Yahoo error: ${data.chart.error.description ?? data.chart.error.code}`);
  const r = data.chart?.result?.[0];
  if (!r || !r.timestamp || !r.indicators?.quote?.[0]) {
    throw new Error("Yahoo chart: empty result");
  }

  const ts = r.timestamp;
  const q = r.indicators.quote[0];
  const adj = r.indicators.adjclose?.[0]?.adjclose;
  const out: Candle[] = [];
  for (let i = 0; i < ts.length; i++) {
    const close = q.close?.[i];
    if (close == null) continue;
    // 复权因子 = adjclose / close（既含拆股也含分红）。对全部 OHLC 用同一因子缩放，
    // 既消除拆股跳空、又消除分红台阶，且保持 high≥close≥low 等内部关系。
    const a = adj?.[i];
    const f = a != null && close > 0 ? a / close : 1;
    out.push({
      date: new Date(ts[i] * 1000),
      open: (q.open?.[i] ?? close) * f,
      high: (q.high?.[i] ?? close) * f,
      low: (q.low?.[i] ?? close) * f,
      close: close * f,
      volume: q.volume?.[i] ?? 0,
    });
  }
  out.sort((a, b) => a.date.getTime() - b.date.getTime());
  return out;
}
