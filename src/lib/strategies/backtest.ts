import type { Candle } from "@/lib/data/yahoo";
import type { Level } from "./types";

export interface Trade {
  entryDate: string;
  entryPrice: number;
  exitDate: string;
  exitPrice: number;
  returnPct: number;
  holdDays: number;
}

export interface BacktestResult {
  initialEquity: number;
  finalEquity: number;
  totalReturn: number;     // %
  buyHoldReturn: number;   // %
  excessReturn: number;    // = totalReturn - buyHoldReturn
  winRate: number;         // %
  numTrades: number;
  avgTradeReturn: number;  // %
  maxDrawdown: number;     // %
  avgHoldDays: number;
  exposure: number;        // 持仓时间占比（%）
  trades: Trade[];
  equityCurve: { time: string; equity: number; buyHold: number }[];
}

/**
 * 长线多头回测（long-only）：
 *   - level 从非 long → long 时，下一根开盘价买入（避免使用未来信息）
 *   - level 从 long → 非 long 时，下一根开盘价卖出
 *   - 至期末仍持仓则按最后一根收盘价了结
 *
 * candles 与 levels 长度必须一致，levels[i] 对应 candles[i] 时的级别。
 */
export function backtest(
  candles: Candle[],
  levels: Level[],
  opts: { initialEquity?: number; costBps?: number } = {},
): BacktestResult {
  const init = opts.initialEquity ?? 10000;
  // 单边交易成本（基点）：买入抬价、卖出压价，体现手续费+滑点。默认 0（不改历史显示数值）。
  const cost = Math.max(0, opts.costBps ?? 0) / 10000;
  const empty: BacktestResult = {
    initialEquity: init,
    finalEquity: init,
    totalReturn: 0,
    buyHoldReturn: 0,
    excessReturn: 0,
    winRate: 0,
    numTrades: 0,
    avgTradeReturn: 0,
    maxDrawdown: 0,
    avgHoldDays: 0,
    exposure: 0,
    trades: [],
    equityCurve: [],
  };
  if (candles.length === 0 || levels.length === 0) return empty;

  // 找第一个能交易的起点：跳过 levels 都是 neutral 的预热期前段
  let cash = init;
  let shares = 0;
  let entryPrice = 0;
  let entryDate = "";
  let entryIdx = -1;
  const trades: Trade[] = [];
  const curve: BacktestResult["equityCurve"] = [];
  let peak = init;
  let maxDD = 0;
  let holdingBars = 0;

  const firstClose = candles[0].close;

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const level = levels[i];
    const prev = i > 0 ? levels[i - 1] : "neutral";
    const dateStr = c.date.toISOString().slice(0, 10);

    // 触发：level 变化 → 下一根开盘价交易
    if (level !== prev && i < candles.length - 1) {
      const next = candles[i + 1];
      const tradeDate = next.date.toISOString().slice(0, 10);
      // 成交价含成本：买入按 open×(1+cost)、卖出按 open×(1-cost)，entryPrice/exitPrice 即净成交价，
      // 故 returnPct 与权益曲线都已扣除来回成本。
      const buyPrice = next.open * (1 + cost);
      const sellPrice = next.open * (1 - cost);

      if (level === "long" && shares === 0 && buyPrice > 0) {
        shares = cash / buyPrice;
        cash = 0;
        entryPrice = buyPrice;
        entryDate = tradeDate;
        entryIdx = i + 1;
      } else if (level !== "long" && shares > 0) {
        const exitValue = shares * sellPrice;
        trades.push({
          entryDate,
          entryPrice,
          exitDate: tradeDate,
          exitPrice: sellPrice,
          returnPct: ((sellPrice - entryPrice) / entryPrice) * 100,
          holdDays: i + 1 - entryIdx,
        });
        cash = exitValue;
        shares = 0;
        entryIdx = -1;
      }
    }

    const equity = cash + shares * c.close;
    if (equity > peak) peak = equity;
    const dd = ((peak - equity) / peak) * 100;
    if (dd > maxDD) maxDD = dd;
    if (shares > 0) holdingBars += 1;

    curve.push({
      time: dateStr,
      equity,
      buyHold: init * (c.close / firstClose),
    });
  }

  // 期末若仍持仓，按最后一根收盘价了结（同样扣卖出成本）
  if (shares > 0) {
    const last = candles[candles.length - 1];
    const lastSell = last.close * (1 - cost);
    trades.push({
      entryDate,
      entryPrice,
      exitDate: last.date.toISOString().slice(0, 10),
      exitPrice: lastSell,
      returnPct: ((lastSell - entryPrice) / entryPrice) * 100,
      holdDays: candles.length - 1 - entryIdx,
    });
    cash = shares * lastSell;
    shares = 0;
  }

  const finalEquity = cash;
  const totalReturn = ((finalEquity - init) / init) * 100;
  const lastClose = candles[candles.length - 1].close;
  const buyHoldReturn = ((lastClose - firstClose) / firstClose) * 100;
  const wins = trades.filter((t) => t.returnPct > 0).length;
  const avgTradeReturn = trades.length > 0 ? trades.reduce((a, t) => a + t.returnPct, 0) / trades.length : 0;
  const avgHoldDays = trades.length > 0 ? trades.reduce((a, t) => a + t.holdDays, 0) / trades.length : 0;
  const exposure = candles.length > 0 ? (holdingBars / candles.length) * 100 : 0;

  return {
    initialEquity: init,
    finalEquity,
    totalReturn,
    buyHoldReturn,
    excessReturn: totalReturn - buyHoldReturn,
    winRate: trades.length > 0 ? (wins / trades.length) * 100 : 0,
    numTrades: trades.length,
    avgTradeReturn,
    maxDrawdown: maxDD,
    avgHoldDays,
    exposure,
    trades,
    equityCurve: curve,
  };
}
