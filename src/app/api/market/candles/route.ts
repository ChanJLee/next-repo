import { NextRequest, NextResponse } from "next/server";
import { getMarketCandles } from "@/lib/data/cache";
import { getStooqApikeyFromCookie } from "@/lib/data/stooq-key";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// 仅允许这些市场参考标的（跨资产特征用），避免被当成任意取数代理。
const ALLOWED = new Set(["SPY"]);

/**
 * 市场参考序列（如 SPY），供前端算跨资产条件特征。只返回 {time, close}，载荷尽量小。
 * GET /api/market/candles?ticker=SPY&days=800
 */
export async function GET(req: NextRequest) {
  const ticker = (req.nextUrl.searchParams.get("ticker") ?? "SPY").toUpperCase();
  if (!ALLOWED.has(ticker)) {
    return NextResponse.json({ error: `ticker not allowed: ${ticker}` }, { status: 400 });
  }
  const daysParam = req.nextUrl.searchParams.get("days");
  const days = Math.max(60, Math.min(Number(daysParam) || 800, 3650));

  try {
    const candles = await getMarketCandles(ticker, days, getStooqApikeyFromCookie());
    const byDay = new Map<string, number>();
    for (const c of candles) byDay.set(c.date.toISOString().slice(0, 10), c.close);
    return NextResponse.json({
      ticker,
      closes: Array.from(byDay.entries()).map(([time, close]) => ({ time, close })),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "fetch failed" },
      { status: 502 },
    );
  }
}
