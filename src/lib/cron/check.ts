import { prisma } from "@/lib/db";
import { getCandlesCached, getQuotesCached } from "@/lib/data/cache";
import type { Quote } from "@/lib/data/yahoo";
import { classify } from "@/lib/strategies/classify";
import { StrategyKindEnum, StrategyParamsSchema, isSignalTransition, type Level } from "@/lib/strategies/types";
import { isMarketOpen } from "@/lib/market/hours";

export interface CheckReport {
  marketOpen: boolean;
  symbolsChecked: number;
  strategiesEvaluated: number;
  transitions: number;
  errors: { ticker?: string; strategy?: string; message: string }[];
  skipped?: string;
}

export async function runCheck(force: boolean): Promise<CheckReport> {
  const report: CheckReport = {
    marketOpen: isMarketOpen(),
    symbolsChecked: 0,
    strategiesEvaluated: 0,
    transitions: 0,
    errors: [],
  };

  if (!report.marketOpen && !force) {
    report.skipped = "美股闭市中（非交易时段或周末）";
    return report;
  }

  const symbols = await prisma.symbol.findMany({
    where: { enabled: true, strategies: { some: { enabled: true } } },
    include: { strategies: { where: { enabled: true } } },
  });
  if (symbols.length === 0) return report;
  report.symbolsChecked = symbols.length;

  let quoteMap: Map<string, Quote>;
  try {
    quoteMap = await getQuotesCached(symbols.map((s) => ({ id: s.id, ticker: s.ticker })));
  } catch (e) {
    report.errors.push({ message: `批量行情拉取失败: ${e instanceof Error ? e.message : String(e)}` });
    return report;
  }

  async function processSymbol(sym: (typeof symbols)[number]): Promise<void> {
    const quote = quoteMap.get(sym.ticker);
    if (!quote) {
      report.errors.push({ ticker: sym.ticker, message: "未拿到报价" });
      return;
    }

    const maxLookback = Math.max(
      ...sym.strategies.map((s) => {
        try {
          const p = JSON.parse(s.params || "{}");
          return Math.max(p.period ?? 0, (p.slow ?? 0) + (p.signal ?? 0));
        } catch {
          return 0;
        }
      }),
      50,
    );
    let candles: Awaited<ReturnType<typeof getCandlesCached>>;
    try {
      candles = await getCandlesCached({ symbolId: sym.id, ticker: sym.ticker, days: maxLookback * 2 + 30 });
    } catch (e) {
      report.errors.push({ ticker: sym.ticker, message: `K线拉取失败: ${e instanceof Error ? e.message : String(e)}` });
      return;
    }

    for (const strategy of sym.strategies) {
      report.strategiesEvaluated += 1;
      const kindParsed = StrategyKindEnum.safeParse(strategy.kind);
      if (!kindParsed.success) {
        report.errors.push({ ticker: sym.ticker, strategy: strategy.name, message: `未知 kind: ${strategy.kind}` });
        continue;
      }
      let params;
      try {
        params = StrategyParamsSchema.parse(JSON.parse(strategy.params || "{}"));
      } catch {
        report.errors.push({ ticker: sym.ticker, strategy: strategy.name, message: `params 解析失败` });
        continue;
      }

      const result = classify(kindParsed.data, params, candles, quote.price);
      const prev = strategy.currentLevel as Level;
      const next = result.level;

      await prisma.strategy.update({
        where: { id: strategy.id },
        data: { currentLevel: next, lastEvalAt: new Date() },
      });

      if (!isSignalTransition(prev, next)) continue;
      report.transitions += 1;

      const cooldownAgo = new Date(Date.now() - strategy.cooldownSec * 1000);
      const recent = await prisma.strategySignal.findFirst({
        where: { strategyId: strategy.id, triggeredAt: { gt: cooldownAgo } },
      });
      if (recent) continue;

      await prisma.strategySignal.create({
        data: {
          strategyId: strategy.id,
          symbolId: sym.id,
          level: next,
          prevLevel: prev,
          snapshot: JSON.stringify({
            kind: kindParsed.data,
            description: result.description,
            values: result.values,
            quote: { price: quote.price, changePercent: quote.changePercent, volume: quote.volume },
          }),
          pushed: false,
        },
      });
    }
  }

  // 并发处理各标的，压缩外部行情/K线请求的串行等待；并发上限避免打爆数据源与 DB 连接池。
  const CONCURRENCY = 5;
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < symbols.length) {
      await processSymbol(symbols[cursor++]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, symbols.length) }, () => worker()));

  return report;
}
