import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCandlesCached, getQuotesCached } from "@/lib/data/cache";
import type { Quote } from "@/lib/data/yahoo";
import { classify } from "@/lib/strategies/classify";
import { StrategyKindEnum, StrategyParamsSchema, isSignalTransition, type Level } from "@/lib/strategies/types";
import { isMarketOpen } from "@/lib/market/hours";
import { getFeishuConfig } from "@/lib/settings";
import { sendFeishuCard } from "@/lib/notifier/feishu";
import { formatSignalCard } from "@/lib/notifier/format";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface CheckReport {
  marketOpen: boolean;
  symbolsChecked: number;
  strategiesEvaluated: number;
  transitions: number;
  pushed: number;
  errors: { ticker?: string; strategy?: string; message: string }[];
  skipped?: string;
}

function unauthorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const got = req.headers.get("x-cron-secret") ?? req.nextUrl.searchParams.get("secret");
  return got !== expected;
}

async function runCheck(force: boolean): Promise<CheckReport> {
  const report: CheckReport = {
    marketOpen: isMarketOpen(),
    symbolsChecked: 0,
    strategiesEvaluated: 0,
    transitions: 0,
    pushed: 0,
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

  const feishuCfg = await getFeishuConfig();

  for (const sym of symbols) {
    const quote = quoteMap.get(sym.ticker);
    if (!quote) {
      report.errors.push({ ticker: sym.ticker, message: "未拿到报价" });
      continue;
    }

    // 一次拉够预热 + 评估所需的 K 线（按最大 period 估算）
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
      continue;
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

      // 无论是否转向都更新 currentLevel & lastEvalAt
      await prisma.strategy.update({
        where: { id: strategy.id },
        data: { currentLevel: next, lastEvalAt: new Date() },
      });

      if (!isSignalTransition(prev, next)) continue;
      report.transitions += 1;

      // 冷却检查
      const cooldownAgo = new Date(Date.now() - strategy.cooldownSec * 1000);
      const recent = await prisma.strategySignal.findFirst({
        where: { strategyId: strategy.id, triggeredAt: { gt: cooldownAgo } },
      });
      if (recent) continue;

      let pushed = false;
      let pushError: string | undefined;
      if (feishuCfg) {
        try {
          const card = formatSignalCard({
            ticker: sym.ticker,
            symbolName: sym.name,
            strategyName: strategy.name,
            level: next,
            prevLevel: prev,
            description: result.description,
            price: quote.price,
            changePercent: quote.changePercent,
            triggeredAt: new Date(),
          });
          await sendFeishuCard(feishuCfg, card);
          pushed = true;
          report.pushed += 1;
        } catch (e) {
          pushError = e instanceof Error ? e.message : String(e);
          report.errors.push({ ticker: sym.ticker, strategy: strategy.name, message: `推送失败: ${pushError}` });
        }
      } else {
        pushError = "未配置飞书 webhook";
      }

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
          pushed,
          pushError,
        },
      });
    }
  }

  return report;
}

export async function POST(req: NextRequest) {
  if (unauthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const force = req.nextUrl.searchParams.get("force") === "1";
  const report = await runCheck(force);
  return NextResponse.json(report);
}

export async function GET(req: NextRequest) {
  return POST(req);
}
