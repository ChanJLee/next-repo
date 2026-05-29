import Link from "next/link";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LevelBadge } from "@/components/level-badge";
import { LEVEL_LABEL } from "@/lib/strategies/types";
import { isMarketOpen } from "@/lib/market/hours";
import { getQuotesCached } from "@/lib/data/cache";
import { getQuotes, type Quote } from "@/lib/data/yahoo";
import { TriggerCheckButton } from "./_components/trigger-check-button";

export const dynamic = "force-dynamic";
// 手动/强制检查走从本页发起的 Server Action（runCheck 会拉行情+逐策略评估），
// 吃的是本页的函数时限。对齐 cron 路由，给足 60s（Hobby 上限）防 504。
export const maxDuration = 60;

// 大盘基准（取 watchlist 中同 ticker 的标的）
const BENCHMARKS = [
  { ticker: "SPY", name: "标普 500" },
  { ticker: "QQQM", name: "纳指 100" },
];

function sma(closes: number[], n: number): number | null {
  if (closes.length < n) return null;
  let s = 0;
  for (let i = closes.length - n; i < closes.length; i++) s += closes[i];
  return s / n;
}

// MA50 vs MA200：当前是金叉(50>200)还是死叉，以及近 lookback 根内是否刚发生交叉
function maCross(closes: number[], lookback = 20): { golden: boolean; recent: boolean } | null {
  const ma50 = sma(closes, 50);
  const ma200 = sma(closes, 200);
  if (ma50 == null || ma200 == null) return null;
  const golden = ma50 > ma200;
  const prev = closes.slice(0, Math.max(0, closes.length - lookback));
  const pm50 = sma(prev, 50);
  const pm200 = sma(prev, 200);
  const recent = pm50 != null && pm200 != null ? pm50 > pm200 !== golden : false;
  return { golden, recent };
}

// VIX 水平解读：低=自满(风险积累)，高=恐慌(常见阶段底)
function vixRegime(v: number): { label: string; cls: string; hint: string } {
  if (v >= 30) return { label: "恐慌", cls: "bg-red-100 text-red-700", hint: ">30 多见于急跌/阶段底" };
  if (v >= 20) return { label: "警觉", cls: "bg-amber-100 text-amber-700", hint: "波动加大，风险偏好转弱" };
  if (v >= 13) return { label: "平静", cls: "bg-green-100 text-green-700", hint: "正常波动区间" };
  return { label: "自满", cls: "bg-orange-100 text-orange-700", hint: "<13 警惕过度乐观、风险积累" };
}

function marketTrend(price: number | null, ma50: number | null, ma200: number | null): { label: string; cls: string } {
  if (price == null || ma200 == null) return { label: "数据不足", cls: "bg-slate-100 text-slate-600" };
  if (ma50 != null && price > ma50 && ma50 > ma200) return { label: "多头排列 · 上行", cls: "bg-green-100 text-green-700" };
  if (ma50 != null && price < ma50 && ma50 < ma200) return { label: "空头排列 · 下行", cls: "bg-red-100 text-red-700" };
  if (price > ma200) return { label: "MA200 上方 · 偏多", cls: "bg-green-50 text-green-700" };
  return { label: "MA200 下方 · 偏空", cls: "bg-red-50 text-red-700" };
}

/** 今日（美东）零点的 UTC 时刻——美股按 ET 交易日划分。 */
function startOfTodayET(): Date {
  const now = new Date();
  const etNow = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const offset = now.getTime() - etNow.getTime(); // ET 与 UTC 的偏移
  const etMidnight = new Date(etNow);
  etMidnight.setHours(0, 0, 0, 0);
  return new Date(etMidnight.getTime() + offset);
}

export default async function HomePage() {
  const startToday = startOfTodayET();
  const [
    symbolCount,
    strategyCount,
    enabledStrategyCount,
    signals,
    recentSignalCount,
    enabledSymbols,
    todaySignals,
    levelGroups,
    unpushedCount,
    latestCandle,
    lastEval,
  ] = await Promise.all([
    prisma.symbol.count(),
    prisma.strategy.count(),
    prisma.strategy.count({ where: { enabled: true } }),
    prisma.strategySignal.findMany({
      orderBy: { triggeredAt: "desc" },
      take: 20,
      include: { strategy: true, symbol: true },
    }),
    prisma.strategySignal.count({ where: { triggeredAt: { gt: new Date(Date.now() - 30 * 86400_000) } } }),
    prisma.symbol.findMany({ where: { enabled: true }, select: { id: true, ticker: true, name: true }, orderBy: { ticker: "asc" } }),
    prisma.strategySignal.findMany({ where: { triggeredAt: { gte: startToday } }, include: { strategy: true, symbol: true }, orderBy: { triggeredAt: "desc" } }),
    prisma.strategy.groupBy({ by: ["currentLevel"], where: { enabled: true }, _count: true }),
    prisma.strategySignal.count({ where: { pushed: false } }),
    prisma.candle.findFirst({ orderBy: { date: "desc" }, select: { date: true } }),
    prisma.strategy.findFirst({ where: { lastEvalAt: { not: null } }, orderBy: { lastEvalAt: "desc" }, select: { lastEvalAt: true } }),
  ]);

  // 实时报价（带缓存，失败降级为空——不阻塞页面）
  let quotes = new Map<string, Quote>();
  try {
    quotes = await getQuotesCached(enabledSymbols.map((s) => ({ id: s.id, ticker: s.ticker })));
  } catch {
    /* 行情拉取失败时简报里标注 */
  }

  // 各标的统计（读 DB 缓存 K 线一次算齐）：MA、12月动量、金叉/死叉。
  // 大盘基准与"监控池宽度"都基于这份数据，避免重复查询。
  const symbolStats = await Promise.all(
    enabledSymbols.map(async (s) => {
      const rows = await prisma.candle.findMany({
        where: { symbolId: s.id },
        orderBy: { date: "desc" },
        take: 300,
        select: { close: true },
      });
      const closes = rows.map((r) => r.close).reverse();
      const last = closes.at(-1) ?? null;
      const roc252 = closes.length >= 253 ? (closes[closes.length - 1] / closes[closes.length - 253] - 1) * 100 : null;
      return { sym: s, last, ma50: sma(closes, 50), ma200: sma(closes, 200), roc252, cross: maCross(closes, 20) };
    }),
  );

  // 大盘基准（SPY/QQQM）
  const benchmarks = BENCHMARKS.map((b) => {
    const st = symbolStats.find((x) => x.sym.ticker === b.ticker);
    if (!st) return null;
    const q = quotes.get(b.ticker);
    return { ...b, id: st.sym.id, price: q?.price ?? st.last ?? null, changePercent: q?.changePercent ?? null, ma50: st.ma50, ma200: st.ma200, roc252: st.roc252, cross: st.cross };
  }).filter((x): x is NonNullable<typeof x> => x !== null);

  // 监控池迷你宽度：多少只站上 MA200 / MA50
  const w200 = symbolStats.filter((x) => x.ma200 != null && x.last != null);
  const above200 = w200.filter((x) => (x.last as number) > (x.ma200 as number)).length;
  const w50 = symbolStats.filter((x) => x.ma50 != null && x.last != null);
  const above50 = w50.filter((x) => (x.last as number) > (x.ma50 as number)).length;
  const breadthPct = w200.length > 0 ? (above200 / w200.length) * 100 : null;

  // VIX 恐慌指数（不在 watchlist，直接拉 ^VIX 实时报价，失败降级）
  let vix: { price: number; changePercent: number } | null = null;
  try {
    const [q] = await getQuotes(["^VIX"]);
    if (q) vix = { price: q.price, changePercent: q.changePercent };
  } catch {
    /* 行情失败时不显示 */
  }

  const marketOpen = isMarketOpen();
  const levelCount = { long: 0, neutral: 0, short: 0 } as Record<string, number>;
  for (const g of levelGroups) levelCount[g.currentLevel] = g._count;
  const todayLong = todaySignals.filter((s) => s.level === "long").length;
  const todayShort = todaySignals.filter((s) => s.level === "short").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">总览</h1>
        <div className="flex gap-2">
          <TriggerCheckButton />
          <Button asChild variant="outline"><Link href="/watchlist">管理监控</Link></Button>
        </div>
      </div>

      {/* 大盘 */}
      {benchmarks.length > 0 ? (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">大盘</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {benchmarks.map((b) => {
                const t = marketTrend(b.price, b.ma50, b.ma200);
                const distMa200 = b.price != null && b.ma200 != null ? ((b.price - b.ma200) / b.ma200) * 100 : null;
                return (
                  <Link key={b.id} href={`/watchlist/${b.id}`} className="rounded-md border px-4 py-3 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <span className="font-medium">{b.name}</span>
                        <span className="ml-1 text-xs text-muted-foreground">{b.ticker}</span>
                      </div>
                      <span className={`rounded px-2 py-0.5 text-xs ${t.cls}`}>{t.label}</span>
                    </div>
                    <div className="mt-1 flex items-baseline gap-2">
                      <span className="text-xl font-semibold">{b.price != null ? `$${b.price.toFixed(2)}` : "—"}</span>
                      {b.changePercent != null ? (
                        <span className={`text-sm font-medium ${b.changePercent >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {b.changePercent >= 0 ? "+" : ""}{b.changePercent.toFixed(2)}%
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      {b.roc252 != null ? (
                        <span className={b.roc252 >= 0 ? "text-green-700" : "text-red-700"}>
                          12月动量 {b.roc252 >= 0 ? "+" : ""}{b.roc252.toFixed(1)}%
                        </span>
                      ) : null}
                      {b.cross ? (
                        <span className={b.cross.golden ? "text-green-700" : "text-red-700"}>
                          {b.cross.golden ? "金叉" : "死叉"}{b.cross.recent ? "（近期）🔥" : ""}
                        </span>
                      ) : null}
                      {distMa200 != null ? <span>距 MA200 {distMa200 >= 0 ? "+" : ""}{distMa200.toFixed(1)}%</span> : null}
                    </div>
                  </Link>
                );
              })}
            </div>
            {/* VIX 恐慌指数 */}
            {vix ? (
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3 text-xs">
                <span className="text-muted-foreground">VIX 恐慌指数：</span>
                <span className="text-sm font-semibold">{vix.price.toFixed(1)}</span>
                {/* VIX 上涨=恐慌升温，用红色 */}
                <span className={vix.changePercent >= 0 ? "text-red-600" : "text-green-600"}>
                  {vix.changePercent >= 0 ? "+" : ""}{vix.changePercent.toFixed(1)}%
                </span>
                <span className={`rounded px-2 py-0.5 ${vixRegime(vix.price).cls}`}>{vixRegime(vix.price).label}</span>
                <span className="text-muted-foreground">{vixRegime(vix.price).hint}</span>
              </div>
            ) : null}

            {/* 监控池迷你宽度 */}
            {w200.length > 0 ? (
              <div className="mt-3 border-t pt-3 text-xs">
                <span className="text-muted-foreground">监控池宽度（{w200.length} 只）：</span>
                <span className={breadthPct != null && breadthPct >= 60 ? "text-green-700 font-medium" : breadthPct != null && breadthPct < 40 ? "text-red-700 font-medium" : "font-medium"}>
                  {above200} 只站上 MA200（{breadthPct != null ? breadthPct.toFixed(0) : "—"}%）
                </span>
                <span className="text-muted-foreground"> · {above50} / {w50.length} 站上 MA50</span>
                <span className="ml-1 text-muted-foreground">{breadthPct != null && breadthPct >= 60 ? "· 普涨偏强" : breadthPct != null && breadthPct < 40 ? "· 普遍走弱" : "· 强弱分化"}</span>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {/* 今日简报 */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">今日简报</CardTitle>
            <div className="flex items-center gap-2 text-xs">
              <span className={marketOpen ? "rounded bg-green-100 text-green-700 px-2 py-0.5" : "rounded bg-slate-100 text-slate-600 px-2 py-0.5"}>
                美股{marketOpen ? "开盘中" : "休市"}
              </span>
              <span className="text-muted-foreground">
                {new Date().toLocaleDateString("zh-CN", { timeZone: "America/New_York", month: "long", day: "numeric", weekday: "short" })}（美东）
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 关键指标 */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Mini label="今日信号" value={`${todaySignals.length}`} hint={`转多 ${todayLong} · 转空 ${todayShort}`} />
            <Mini
              label="当前多空分布"
              value={`${levelCount.long} / ${levelCount.neutral} / ${levelCount.short}`}
              hint="多 / 中 / 空（启用策略）"
            />
            <Mini label="未推送信号" value={`${unpushedCount}`} hint={unpushedCount > 0 ? "待推送或推送失败" : "已全部处理"} />
            <Mini
              label="数据状态"
              value={latestCandle ? new Date(latestCandle.date).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" }) : "—"}
              hint={lastEval?.lastEvalAt ? `上次检查 ${new Date(lastEval.lastEvalAt).toLocaleString("zh-CN", { hour12: false, month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}` : "尚未检查"}
            />
          </div>

          {/* 实时报价 */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">实时报价</span>
              {quotes.size === 0 ? <span className="text-xs text-red-600">行情获取失败</span> : null}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {enabledSymbols.map((s) => {
                const q = quotes.get(s.ticker);
                return (
                  <Link
                    key={s.id}
                    href={`/watchlist/${s.id}`}
                    className="rounded-md border px-3 py-2 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium text-sm">{s.ticker}</span>
                      {q ? (
                        <span className={`text-xs font-medium ${q.changePercent >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {q.changePercent >= 0 ? "+" : ""}{q.changePercent.toFixed(2)}%
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </div>
                    <div className="mt-0.5 text-sm">{q ? `$${q.price.toFixed(2)}` : <span className="text-muted-foreground text-xs">无报价</span>}</div>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* 今日信号 */}
          {todaySignals.length > 0 ? (
            <div>
              <div className="mb-1 text-xs font-medium text-muted-foreground">今日信号</div>
              <div className="divide-y rounded-md border">
                {todaySignals.map((sig) => (
                  <div key={sig.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <Link href={`/watchlist/${sig.symbolId}`} className="font-medium hover:underline">{sig.symbol.ticker}</Link>
                      <span className="text-muted-foreground truncate">{sig.strategy.name}</span>
                      <span className="text-xs text-muted-foreground">{LEVEL_LABEL[sig.prevLevel as keyof typeof LEVEL_LABEL]} →</span>
                      <LevelBadge level={sig.level} />
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(sig.triggeredAt).toLocaleTimeString("zh-CN", { hour12: false, hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">今日暂无新信号。</p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat title="股票数" value={symbolCount} />
        <Stat title="策略数" value={strategyCount} hint={`${enabledStrategyCount} 启用中`} />
        <Stat title="近 30 天信号" value={recentSignalCount} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>最近信号</CardTitle>
          <CardDescription>最近 20 次转多 / 转空触发</CardDescription>
        </CardHeader>
        <CardContent>
          {signals.length === 0 ? (
            <p className="text-sm text-muted-foreground">还没有信号记录。</p>
          ) : (
            <div className="divide-y">
              {signals.map((sig) => {
                let snap: { description?: string } = {};
                try { snap = JSON.parse(sig.snapshot); } catch { /* ignore */ }
                return (
                  <div key={sig.id} className="py-3 flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-sm">
                        <Link href={`/watchlist/${sig.symbolId}`} className="font-medium hover:underline">{sig.symbol.ticker}</Link>
                        <span className="text-muted-foreground">·</span>
                        <span>{sig.strategy.name}</span>
                        <span className="text-xs text-muted-foreground">{LEVEL_LABEL[sig.prevLevel as keyof typeof LEVEL_LABEL]} →</span>
                        <LevelBadge level={sig.level} />
                        {sig.pushed ? (
                          <span className="ml-1 text-xs rounded bg-green-100 text-green-700 px-1.5 py-0.5">已推送</span>
                        ) : (
                          <span className="ml-1 text-xs rounded bg-amber-100 text-amber-700 px-1.5 py-0.5">未推送</span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">{snap.description ?? "—"}</div>
                      {sig.pushError ? <div className="text-xs text-red-600 mt-1">{sig.pushError}</div> : null}
                    </div>
                    <div className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(sig.triggeredAt).toLocaleString("zh-CN", { hour12: false })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Mini({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-md border px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold leading-tight">{value}</div>
      {hint ? <div className="text-xs text-muted-foreground mt-0.5">{hint}</div> : null}
    </div>
  );
}

function Stat({ title, value, hint }: { title: string; value: number; hint?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-3xl">{value}</CardTitle>
      </CardHeader>
      {hint ? <CardContent className="text-xs text-muted-foreground pt-0">{hint}</CardContent> : null}
    </Card>
  );
}
