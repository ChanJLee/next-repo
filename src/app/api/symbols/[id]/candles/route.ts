import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCandlesCached } from "@/lib/data/cache";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RANGE_DAYS: Record<string, number> = {
  "1w": 14,
  "1m": 35,
  "3m": 100,
  "1y": 380,
};

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  const range = req.nextUrl.searchParams.get("range") ?? "1m";
  const force = req.nextUrl.searchParams.get("force") === "1";
  const days = RANGE_DAYS[range] ?? 35;

  const sym = await prisma.symbol.findUnique({ where: { id } });
  if (!sym) return NextResponse.json({ error: "symbol not found" }, { status: 404 });

  try {
    const candles = await getCandlesCached({ symbolId: id, ticker: sym.ticker, days, force });
    // 仅返回时间窗口内的数据（缓存里可能包含更早的历史）
    const since = new Date(Date.now() - days * 86400_000);
    const inRange = candles.filter((c) => c.date >= since);
    return NextResponse.json({
      ticker: sym.ticker,
      range,
      cached: !force,
      candles: inRange.map((c) => ({
        time: c.date.toISOString().slice(0, 10),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      })),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "fetch failed" },
      { status: 502 },
    );
  }
}
