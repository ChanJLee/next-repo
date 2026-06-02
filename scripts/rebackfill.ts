/**
 * 用「复权」长历史重灌 K 线缓存，修正两件事：
 *   1) 复权：Stooq 已复权（拆股已调整），消除拆股假跳空；Yahoo 兜底用 adjclose 反推。
 *   2) 拉长：Stooq 能拉到上市以来全部历史（几十年），覆盖各标的现有的短/未复权数据。
 *
 * 安全策略：先把某标的的复权数据完整拉到内存并校验非空，再在一个事务里
 * deleteMany + createMany 整段替换；拉取失败则跳过该标的、保留原数据。
 * Yahoo 对同一 IP 有限流，脚本带退避重试 + 标的间间隔。
 *
 * 用法：pnpm exec tsx scripts/rebackfill.ts [TICKER ...]   # 不传则全部标的
 */
import { prisma } from "../src/lib/db"; // 触发 dotenv，加载 .env 里的 STOOQ_APIKEY
import { getDailyCandlesFromStooq } from "../src/lib/data/stooq";
import { getDailyCandlesFromYahooChart } from "../src/lib/data/yahoo-chart";
import type { Candle } from "../src/lib/data/yahoo";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const fmt = (d: Date) => d.toISOString().slice(0, 10);
const toUtcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

// 优先 Stooq（已复权、可拉几十年、不易被封；需 .env 里的 STOOQ_APIKEY），
// 失败再退到 Yahoo chart（复权，但云/被限流 IP 上常 429）。
async function fetchAdjustedWithRetry(ticker: string, tries = 5): Promise<Candle[]> {
  const key = process.env.STOOQ_APIKEY;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const c = await getDailyCandlesFromStooq(ticker, 99999, key);
      if (c.length > 0) return c;
      throw new Error("stooq empty");
    } catch (e1) {
      try {
        const c = await getDailyCandlesFromYahooChart(ticker, 99999);
        if (c.length > 0) return c;
        throw new Error("yahoo empty");
      } catch (e2) {
        const msg = `stooq:${e1 instanceof Error ? e1.message : e1} / yahoo:${e2 instanceof Error ? e2.message : e2}`;
        if (attempt === tries) throw new Error(msg);
        const wait = Math.min(30000, 5000 * attempt);
        console.log(`  [${ticker}] 第 ${attempt} 次失败（${msg}），${wait / 1000}s 后重试…`);
        await sleep(wait);
      }
    }
  }
  throw new Error("unreachable");
}

async function main() {
  const only = process.argv.slice(2).map((s) => s.toUpperCase());
  const symbols = await prisma.symbol.findMany({ orderBy: { id: "asc" } });
  const targets = only.length ? symbols.filter((s) => only.includes(s.ticker.toUpperCase())) : symbols;

  for (let si = 0; si < targets.length; si++) {
    const s = targets[si];
    try {
      const raw = await fetchAdjustedWithRetry(s.ticker);
      // 归一到 UTC 零点并按日去重（与 @@id([symbolId,date]) 一致）
      const byDay = new Map<number, Candle>();
      for (const c of raw) {
        if (![c.open, c.high, c.low, c.close].every((v) => Number.isFinite(v) && v > 0)) continue;
        const day = toUtcDay(c.date);
        byDay.set(day.getTime(), { ...c, date: day });
      }
      const rows = Array.from(byDay.values()).sort((a, b) => a.date.getTime() - b.date.getTime());
      if (rows.length < 50) { console.log(`[${s.ticker}] 仅 ${rows.length} 根，疑似异常，跳过替换`); continue; }

      const before = await prisma.candle.count({ where: { symbolId: s.id } });
      await prisma.$transaction([
        prisma.candle.deleteMany({ where: { symbolId: s.id } }),
        prisma.candle.createMany({
          data: rows.map((c) => ({ symbolId: s.id, date: c.date, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume })),
        }),
      ]);
      console.log(`[${s.ticker}] 复权重灌：${before} → ${rows.length} 根  (${fmt(rows[0].date)} ~ ${fmt(rows[rows.length - 1].date)})`);
    } catch (e) {
      console.log(`[${s.ticker}] 失败，保留原数据：${e instanceof Error ? e.message : e}`);
    }
    if (si < targets.length - 1) await sleep(3000); // 标的间礼貌间隔，避免限流
  }
  await prisma.$disconnect();
}

main();
