import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getDailyCandles } from "@/lib/data/yahoo";

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
  const days = RANGE_DAYS[range] ?? 35;

  const sym = await prisma.symbol.findUnique({ where: { id } });
  if (!sym) return NextResponse.json({ error: "symbol not found" }, { status: 404 });

  try {
    const candles = await getDailyCandles(sym.ticker, days);
    return NextResponse.json({
      ticker: sym.ticker,
      range,
      candles: candles.map((c) => ({
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
