import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCandlesCached } from "@/lib/data/cache";
import { getStooqApikeyFromCookie } from "@/lib/data/stooq-key";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// 大窗口（如 5 年回测）首次拉取要写不少历史，给足时限防 504。
export const maxDuration = 60;

const RANGE_DAYS: Record<string, number> = {
  "1w": 14,
  "1m": 35,
  "3m": 100,
  "1y": 380,
  "2y": 760,
  "5y": 1850,
};

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  const range = req.nextUrl.searchParams.get("range") ?? "1m";
  const force = req.nextUrl.searchParams.get("force") === "1";
  // 支持显式 days（客户端回测要拉更长窗口，超出 range 档位上限），否则按 range 档位。
  const daysParam = req.nextUrl.searchParams.get("days");
  const days = daysParam ? Math.max(60, Math.min(Number(daysParam) || 0, 3650)) : (RANGE_DAYS[range] ?? 35);

  const sym = await prisma.symbol.findUnique({ where: { id } });
  if (!sym) return NextResponse.json({ error: "symbol not found" }, { status: 404 });

  try {
    const candles = await getCandlesCached({ symbolId: id, ticker: sym.ticker, days, force, stooqApikey: getStooqApikeyFromCookie() });
    // 仅返回时间窗口内的数据（缓存里可能包含更早的历史）
    const since = new Date(Date.now() - days * 86400_000);
    const inRange = candles.filter((c) => c.date >= since);
    // 按交易日去重：不同数据源给同一天打的时间戳不同（Stooq 用 UTC 零点、
    // yahoo-chart 用盘中时刻），会在 DB 里留下同一天的多行。图表要求时间唯一且升序，
    // 这里按日历日折叠并保留最后一条（inRange 已按时间升序 => 最新时间戳胜出）。
    const byDay = new Map<string, { time: string; open: number; high: number; low: number; close: number; volume: number }>();
    for (const c of inRange) {
      const time = c.date.toISOString().slice(0, 10);
      byDay.set(time, { time, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume });
    }
    return NextResponse.json({
      ticker: sym.ticker,
      range,
      cached: !force,
      candles: Array.from(byDay.values()),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "fetch failed" },
      { status: 502 },
    );
  }
}
