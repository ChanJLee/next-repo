import type { Candle } from "./yahoo";

// 内置兜底 apikey：当未通过参数 / cookie / 环境变量提供时使用，让生产环境开箱即用。
// ⚠️ 写死在源码里会随 git 公开，视为已暴露的低敏感 key；要轮换就改这里或用环境变量覆盖。
const DEFAULT_STOOQ_APIKEY = "cnIwux20kQiBl6gT9SroYPG7DvOAMU3j";

/**
 * 把美股 ticker 转换为 Stooq 的命名（小写 + .us 后缀；点号变破折号，比如 BRK.B → brk-b.us）。
 */
function stooqSymbol(ticker: string): string {
  return ticker.toLowerCase().replace(/\./g, "-") + ".us";
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

/**
 * 从 Stooq 拉日线 CSV。日期范围接口需要免费 apikey：
 * 优先级 参数 > process.env.STOOQ_APIKEY > 内置 DEFAULT_STOOQ_APIKEY。
 * CSV 格式：Date,Open,High,Low,Close,Volume
 */
export async function getDailyCandlesFromStooq(
  ticker: string,
  days: number = 365,
  apikey?: string,
): Promise<Candle[]> {
  const end = new Date();
  const start = new Date(end.getTime() - days * 86400_000);
  const key = apikey ?? process.env.STOOQ_APIKEY ?? DEFAULT_STOOQ_APIKEY;
  let url = `https://stooq.com/q/d/l/?s=${stooqSymbol(ticker)}&d1=${fmtDate(start)}&d2=${fmtDate(end)}&i=d`;
  if (key) url += `&apikey=${encodeURIComponent(key)}`;

  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 stock-monitor" },
  });
  if (!res.ok) throw new Error(`Stooq HTTP ${res.status}`);

  const text = await res.text();
  if (!text || text.trim().length < 30 || text.toLowerCase().includes("no data")) {
    throw new Error(`Stooq returned no data for ${ticker}`);
  }

  const lines = text.trim().split(/\r?\n/);
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const iDate = header.indexOf("date");
  const iOpen = header.indexOf("open");
  const iHigh = header.indexOf("high");
  const iLow = header.indexOf("low");
  const iClose = header.indexOf("close");
  const iVolume = header.indexOf("volume");
  if (iDate < 0 || iClose < 0) throw new Error("Stooq: 意外的 CSV 表头");

  const out: Candle[] = [];
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
