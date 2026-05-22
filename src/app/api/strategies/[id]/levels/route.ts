import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCandlesCached } from "@/lib/data/cache";
import { getStooqApikeyFromCookie } from "@/lib/data/stooq-key";
import { levelSeries } from "@/lib/strategies/classify";
import { StrategyKindEnum, StrategyParamsSchema } from "@/lib/strategies/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RANGE_DAYS: Record<string, number> = {
  "1w": 14,
  "1m": 35,
  "3m": 100,
  "1y": 380,
};

/**
 * 返回该策略在指定时间窗口里、每个交易日的级别（多/中/空）。
 * 用于详情页画蜡烛图下方的级别带。
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  const range = req.nextUrl.searchParams.get("range") ?? "1m";
  const days = RANGE_DAYS[range] ?? 35;

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

  // 关键：要计算级别，必须有「足够的预热数据」。比如 MA200 至少需要 200 根 K 线。
  // 所以拉的窗口要包含预热期 + 用户想看的天数，最后只返回窗口内的部分。
  const warmup = Math.max(
    (paramsObj.period ?? 0) + 5,
    (paramsObj.slow ?? 0) + (paramsObj.signal ?? 0) + 5,
    50,
  );
  const fetchDays = days + warmup * 2;

  try {
    const allCandles = await getCandlesCached({
      symbolId: strategy.symbolId,
      ticker: strategy.symbol.ticker,
      days: fetchDays,
      stooqApikey: getStooqApikeyFromCookie(),
    });
    const series = levelSeries(kindParsed.data, paramsObj, allCandles);

    // 仅返回时间窗口内
    const since = new Date(Date.now() - days * 86400_000);
    const items: { time: string; level: string }[] = [];
    for (let i = 0; i < allCandles.length; i++) {
      const c = allCandles[i];
      if (c.date < since) continue;
      items.push({
        time: c.date.toISOString().slice(0, 10),
        level: series[i] ?? "neutral",
      });
    }

    return NextResponse.json({
      strategyId: id,
      kind: strategy.kind,
      name: strategy.name,
      range,
      items,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "fetch failed" },
      { status: 502 },
    );
  }
}
