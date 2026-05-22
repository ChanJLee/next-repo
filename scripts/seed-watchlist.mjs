#!/usr/bin/env node
/**
 * 一键预填充 watchlist + 回填一年历史日线。
 *
 * 用法：
 *   node --env-file=.env scripts/seed-watchlist.mjs            # 默认 1 年
 *   node --env-file=.env scripts/seed-watchlist.mjs --days 730 # 自定义天数
 *
 * 数据源：优先 Stooq（需 STOOQ_APIKEY），失败回退 Yahoo chart API。
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const STOCKS = [
  { ticker: "AAPL",  name: "苹果" },
  { ticker: "NVDA",  name: "英伟达" },
  { ticker: "TSM",   name: "台积电" },
  { ticker: "MU",    name: "美光" },
  { ticker: "GOOGL", name: "谷歌（Alphabet A）" },
  { ticker: "TSLA",  name: "特斯拉" },
  { ticker: "MSFT",  name: "微软" },
  { ticker: "SPY",   name: "标普500 ETF" },
  { ticker: "QQQM",  name: "纳指100 ETF（QQQM）" },
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseDays() {
  const idx = process.argv.indexOf("--days");
  if (idx >= 0 && process.argv[idx + 1]) return Math.max(30, Number(process.argv[idx + 1]) || 365);
  return 365;
}

const YAHOO_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

function stooqSymbol(ticker) {
  return ticker.toLowerCase().replace(/\./g, "-") + ".us";
}
function fmtDate(d) {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

async function fetchFromStooq(ticker, days) {
  const apikey = process.env.STOOQ_APIKEY;
  if (!apikey) throw new Error("no STOOQ_APIKEY");
  const end = new Date();
  const start = new Date(end.getTime() - days * 86400_000);
  const url = `https://stooq.com/q/d/l/?s=${stooqSymbol(ticker)}&d1=${fmtDate(start)}&d2=${fmtDate(end)}&i=d&apikey=${encodeURIComponent(apikey)}`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 stock-monitor-seed" } });
  if (!res.ok) throw new Error(`stooq HTTP ${res.status}`);
  const text = await res.text();
  if (!text || text.trim().length < 30 || text.toLowerCase().includes("no data") || text.toLowerCase().includes("apikey")) {
    throw new Error("stooq returned no data");
  }
  const lines = text.trim().split(/\r?\n/);
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const iDate = header.indexOf("date"), iOpen = header.indexOf("open"), iHigh = header.indexOf("high"),
        iLow = header.indexOf("low"), iClose = header.indexOf("close"), iVolume = header.indexOf("volume");
  const out = [];
  for (const line of lines.slice(1)) {
    const cols = line.split(",");
    if (cols.length < 5) continue;
    const close = Number(cols[iClose]);
    if (!Number.isFinite(close)) continue;
    out.push({
      date: new Date(cols[iDate]),
      open: Number(cols[iOpen]) || close,
      high: Number(cols[iHigh]) || close,
      low: Number(cols[iLow]) || close,
      close,
      volume: iVolume >= 0 ? Number(cols[iVolume]) || 0 : 0,
    });
  }
  out.sort((a, b) => a.date.getTime() - b.date.getTime());
  return out;
}

function rangeForDays(days) {
  if (days <= 5) return "5d";
  if (days <= 30) return "1mo";
  if (days <= 90) return "3mo";
  if (days <= 180) return "6mo";
  if (days <= 365) return "1y";
  if (days <= 730) return "2y";
  if (days <= 1825) return "5y";
  return "10y";
}

async function fetchFromYahoo(ticker, days) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${rangeForDays(days)}&interval=1d`;
  const res = await fetch(url, { headers: { "User-Agent": YAHOO_UA, Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data?.chart?.error) throw new Error(data.chart.error.description ?? data.chart.error.code);
  const r = data?.chart?.result?.[0];
  if (!r?.timestamp || !r.indicators?.quote?.[0]) throw new Error("empty data");

  const ts = r.timestamp;
  const q = r.indicators.quote[0];
  const out = [];
  for (let i = 0; i < ts.length; i++) {
    const close = q.close?.[i];
    if (close == null) continue;
    out.push({
      date: new Date(ts[i] * 1000),
      open: q.open?.[i] ?? close,
      high: q.high?.[i] ?? close,
      low: q.low?.[i] ?? close,
      close,
      volume: q.volume?.[i] ?? 0,
    });
  }
  out.sort((a, b) => a.date.getTime() - b.date.getTime());
  return out;
}

async function seed() {
  const days = parseDays();
  console.log(`📥 预填充 ${STOCKS.length} 只股票，回填 ${days} 天历史\n`);

  let totalCandles = 0;
  const failures = [];

  for (const stock of STOCKS) {
    process.stdout.write(`• ${stock.ticker.padEnd(6)} ${stock.name.padEnd(22)} … `);
    try {
      const sym = await prisma.symbol.upsert({
        where: { ticker: stock.ticker },
        update: { name: stock.name },
        create: { ticker: stock.ticker, name: stock.name },
      });

      let candles;
      let source;
      try {
        candles = await fetchFromStooq(stock.ticker, days);
        source = "stooq";
      } catch (eStooq) {
        try {
          candles = await fetchFromYahoo(stock.ticker, days);
          source = "yahoo";
          await sleep(2000); // 给 yahoo 喘息时间
        } catch (eYahoo) {
          throw new Error(`stooq=${eStooq.message}; yahoo=${eYahoo.message}`);
        }
      }
      if (candles.length === 0) throw new Error("empty data");

      await prisma.$transaction(
        candles.map((c) =>
          prisma.candle.upsert({
            where: { symbolId_date: { symbolId: sym.id, date: c.date } },
            update: { open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume },
            create: { symbolId: sym.id, ...c },
          }),
        ),
      );
      totalCandles += candles.length;
      const first = candles[0].date.toISOString().slice(0, 10);
      const last = candles[candles.length - 1].date.toISOString().slice(0, 10);
      console.log(`✓ ${candles.length} 条 (${first} → ${last}) [${source}]`);
      await sleep(300); // 节流，对外部接口友好
    } catch (e) {
      console.log(`✗ ${e instanceof Error ? e.message : e}`);
      failures.push({ ticker: stock.ticker, error: e instanceof Error ? e.message : String(e) });
    }
  }

  console.log(`\n完成。共 ${totalCandles} 条 K 线入库。`);
  if (failures.length > 0) {
    console.log(`失败 ${failures.length} 只：`);
    for (const f of failures) console.log(`  - ${f.ticker}: ${f.error}`);
    process.exitCode = 1;
  }
}

try {
  await seed();
} finally {
  await prisma.$disconnect();
}
