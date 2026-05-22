import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCandlesCached } from "@/lib/data/cache";
import { getStooqApikeyFromCookie } from "@/lib/data/stooq-key";
import { levelSeries } from "@/lib/strategies/classify";
import { StrategyKindEnum, StrategyParamsSchema } from "@/lib/strategies/types";
import { backtest } from "@/lib/strategies/backtest";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  const days = Math.max(60, Math.min(Number(req.nextUrl.searchParams.get("days") ?? "730"), 3650));

  const strategy = await prisma.strategy.findUnique({ where: { id }, include: { symbol: true } });
  if (!strategy) return NextResponse.json({ error: "strategy not found" }, { status: 404 });

  const kindParsed = StrategyKindEnum.safeParse(strategy.kind);
  if (!kindParsed.success) return NextResponse.json({ error: `unknown kind: ${strategy.kind}` }, { status: 500 });
  let paramsObj;
  try {
    paramsObj = StrategyParamsSchema.parse(JSON.parse(strategy.params || "{}"));
  } catch {
    paramsObj = {};
  }

  // 多拉点预热数据，回测部分只用窗口内（避免预热期被算成"持仓0"导致曲线起点不准）
  const warmup = Math.max(paramsObj.period ?? 0, (paramsObj.slow ?? 0) + (paramsObj.signal ?? 0), 50) + 10;
  const fetchDays = days + warmup * 2;

  try {
    const allCandles = await getCandlesCached({
      symbolId: strategy.symbolId,
      ticker: strategy.symbol.ticker,
      days: fetchDays,
      stooqApikey: getStooqApikeyFromCookie(),
    });
    const allLevels = levelSeries(kindParsed.data, paramsObj, allCandles);

    // 切到回测窗口
    const since = new Date(Date.now() - days * 86400_000);
    const start = allCandles.findIndex((c) => c.date >= since);
    const candles = start >= 0 ? allCandles.slice(start) : allCandles;
    const levels = start >= 0 ? allLevels.slice(start) : allLevels;

    const result = backtest(candles, levels);
    return NextResponse.json({
      strategyId: id,
      name: strategy.name,
      kind: strategy.kind,
      ticker: strategy.symbol.ticker,
      days,
      window: candles.length > 0 ? { from: candles[0].date.toISOString().slice(0, 10), to: candles[candles.length - 1].date.toISOString().slice(0, 10) } : null,
      ...result,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "backtest failed" },
      { status: 502 },
    );
  }
}
