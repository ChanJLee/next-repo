import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getDailyCandles, getQuotes } from "@/lib/data/yahoo";
import { buildContext, evaluate } from "@/lib/rules/evaluator";
import { IndicatorEnum, RuleParamsSchema } from "@/lib/rules/types";
import { isMarketOpen } from "@/lib/market/hours";
import { getDingTalkConfig } from "@/lib/settings";
import { sendDingTalkMarkdown } from "@/lib/notifier/dingtalk";
import { formatAlertMarkdown } from "@/lib/notifier/format";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface CheckReport {
  marketOpen: boolean;
  symbolsChecked: number;
  rulesEvaluated: number;
  triggered: number;
  pushed: number;
  errors: { ticker?: string; rule?: string; message: string }[];
  skipped?: string;
}

function unauthorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false; // 未设置时不校验，便于本地调试
  const got = req.headers.get("x-cron-secret") ?? req.nextUrl.searchParams.get("secret");
  return got !== expected;
}

async function runCheck(force: boolean): Promise<CheckReport> {
  const report: CheckReport = {
    marketOpen: isMarketOpen(),
    symbolsChecked: 0,
    rulesEvaluated: 0,
    triggered: 0,
    pushed: 0,
    errors: [],
  };

  if (!report.marketOpen && !force) {
    report.skipped = "美股闭市中（非交易时段或周末）";
    return report;
  }

  const symbols = await prisma.symbol.findMany({
    where: { enabled: true, rules: { some: { enabled: true } } },
    include: { rules: { where: { enabled: true } } },
  });
  if (symbols.length === 0) return report;
  report.symbolsChecked = symbols.length;

  // 一次拉所有报价
  const tickers = symbols.map((s) => s.ticker);
  let quotes;
  try {
    quotes = await getQuotes(tickers);
  } catch (e) {
    report.errors.push({ message: `批量行情拉取失败: ${e instanceof Error ? e.message : String(e)}` });
    return report;
  }
  const quoteMap = new Map(quotes.map((q) => [q.symbol, q]));

  const dingCfg = await getDingTalkConfig();

  for (const sym of symbols) {
    const quote = quoteMap.get(sym.ticker);
    if (!quote) {
      report.errors.push({ ticker: sym.ticker, message: "未拿到报价" });
      continue;
    }

    // 该 ticker 的规则中如果有技术类，才拉日线
    const needsCandles = sym.rules.some((r) => r.type !== "price" || r.indicator?.startsWith("change_") === false);
    const hasTechOrVol = sym.rules.some((r) => r.type === "technical" || r.type === "volume");
    let candles: Awaited<ReturnType<typeof getDailyCandles>> = [];
    if (needsCandles && hasTechOrVol) {
      try {
        candles = await getDailyCandles(sym.ticker, 180);
      } catch (e) {
        report.errors.push({ ticker: sym.ticker, message: `K线拉取失败: ${e instanceof Error ? e.message : String(e)}` });
      }
    }

    for (const rule of sym.rules) {
      report.rulesEvaluated += 1;
      const indicatorParsed = IndicatorEnum.safeParse(rule.indicator);
      if (!indicatorParsed.success) {
        report.errors.push({ ticker: sym.ticker, rule: rule.name, message: `未知 indicator: ${rule.indicator}` });
        continue;
      }
      let params;
      try {
        params = RuleParamsSchema.parse(JSON.parse(rule.params || "{}"));
      } catch (e) {
        report.errors.push({ ticker: sym.ticker, rule: rule.name, message: `params 解析失败` });
        continue;
      }

      const ctx = buildContext(quote, candles, params);
      const result = evaluate(indicatorParsed.data, params, ctx);
      if (!result.triggered) continue;
      report.triggered += 1;

      // 冷却检查
      const cooldownAgo = new Date(Date.now() - rule.cooldownSec * 1000);
      const recent = await prisma.alert.findFirst({
        where: { ruleId: rule.id, triggeredAt: { gt: cooldownAgo } },
      });
      if (recent) continue;

      // 推送
      let pushed = false;
      let pushError: string | undefined;
      if (dingCfg) {
        try {
          const { title, markdown } = formatAlertMarkdown({
            ticker: sym.ticker,
            symbolName: sym.name,
            ruleName: rule.name,
            description: result.description,
            price: quote.price,
            changePercent: quote.changePercent,
            triggeredAt: new Date(),
          });
          await sendDingTalkMarkdown(dingCfg, title, markdown);
          pushed = true;
          report.pushed += 1;
        } catch (e) {
          pushError = e instanceof Error ? e.message : String(e);
          report.errors.push({ ticker: sym.ticker, rule: rule.name, message: `推送失败: ${pushError}` });
        }
      } else {
        pushError = "未配置钉钉 webhook";
      }

      await prisma.alert.create({
        data: {
          ruleId: rule.id,
          symbolId: sym.id,
          snapshot: JSON.stringify({
            indicator: indicatorParsed.data,
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
  // 方便手动浏览器/curl 触发
  return POST(req);
}
