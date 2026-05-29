import { RSI, MACD, SMA, EMA, BollingerBands, ROC } from "technicalindicators";
import type { Candle } from "@/lib/data/yahoo";
import type { Level, StrategyKind, StrategyParams } from "./types";

export interface ClassifyResult {
  level: Level;
  values: Record<string, number | undefined>;
  description: string;
}

interface SeriesContext {
  candles: Candle[];
  closes: number[];
  highs: number[];
  lows: number[];
}

function buildContext(candles: Candle[]): SeriesContext {
  return {
    candles,
    closes: candles.map((c) => c.close),
    highs: candles.map((c) => c.high),
    lows: candles.map((c) => c.low),
  };
}

/**
 * 给定一组（按时间正序）K 线，返回每根 K 线对应的策略级别。
 * - 用于详情页画历史级别带
 * - 用于 cron 评估时取末尾一根作为当前级别
 *
 * 计算原则：levels[i] 仅基于 candles[0..i] 的数据，不可看未来。
 */
export function levelSeries(kind: StrategyKind, params: StrategyParams, candles: Candle[]): Level[] {
  const ctx = buildContext(candles);
  switch (kind) {
    case "ma_trend":      return seriesMaTrend(params, ctx);
    case "ma_cross":      return seriesMaCross(params, ctx);
    case "rsi_extreme":   return seriesRsiExtreme(params, ctx);
    case "macd":          return seriesMacd(params, ctx);
    case "roc_momentum":  return seriesRocMomentum(params, ctx);
    case "donchian":      return seriesDonchian(params, ctx);
    case "bb_reversion":  return seriesBbReversion(params, ctx);
    case "candle_pattern":return seriesCandlePattern(params, ctx);
    case "selling_climax":return seriesSellingClimax(params, ctx);
    case "buying_climax": return seriesBuyingClimax(params, ctx);
  }
}

export function classify(
  kind: StrategyKind,
  params: StrategyParams,
  candles: Candle[],
  currentPrice?: number,
): ClassifyResult {
  if (candles.length === 0) {
    return { level: "neutral", values: {}, description: "无数据" };
  }
  // 把当前价格临时替换最后一根 close（用于盘中信号），其他字段保持
  const adjusted = currentPrice
    ? [...candles.slice(0, -1), { ...candles[candles.length - 1], close: currentPrice }]
    : candles;
  const series = levelSeries(kind, params, adjusted);
  const level = series[series.length - 1] ?? "neutral";
  const detail = detailFor(kind, params, adjusted, level);
  return { level, ...detail };
}

// ---------- ma_trend ----------
function seriesMaTrend(params: StrategyParams, ctx: SeriesContext): Level[] {
  const period = params.period ?? 200;
  const tol = (params.tolerance ?? 0) / 100;
  const maFn = params.maType === "ema" ? EMA : SMA;
  const ma = maFn.calculate({ values: ctx.closes, period });
  const offset = ctx.closes.length - ma.length;
  return ctx.closes.map((close, i) => {
    if (i < offset) return "neutral";
    const v = ma[i - offset];
    if (close > v * (1 + tol)) return "long";
    if (close < v * (1 - tol)) return "short";
    return "neutral";
  });
}

// ---------- ma_cross ----------
// 双均线交叉：快线在慢线之上=多（金叉状态），之下=空（死叉状态）。
function seriesMaCross(params: StrategyParams, ctx: SeriesContext): Level[] {
  const fast = params.maFast ?? 50;
  const slow = params.maSlow ?? 200;
  const maFn = params.maType === "ema" ? EMA : SMA;
  const maF = maFn.calculate({ values: ctx.closes, period: fast });
  const maS = maFn.calculate({ values: ctx.closes, period: slow });
  const offF = ctx.closes.length - maF.length;
  const offS = ctx.closes.length - maS.length;
  return ctx.closes.map((_, i) => {
    if (i < offF || i < offS) return "neutral"; // 慢线预热完成才有意义
    const f = maF[i - offF];
    const s = maS[i - offS];
    if (f > s) return "long";
    if (f < s) return "short";
    return "neutral";
  });
}

// ---------- rsi_extreme ----------
// 趋势过滤 + 持有到 RSI 回中位（有状态）：
//   - 多：仅在上涨趋势（close > MA(trendPeriod)）中、RSI 跌破 longBelow 入场；
//         持有到 RSI 回升到 exitMid 才退出（不再一碰阈值就跑）。
//   - 空：镜像——下跌趋势中 RSI 上穿 shortAbove 入场，持有到 RSI 跌回 (100-exitMid)。
//   - trendPeriod=0 关闭趋势过滤。空头仅用于级别带/告警，long-only 回测不交易。
function seriesRsiExtreme(params: StrategyParams, ctx: SeriesContext): Level[] {
  const period = params.period ?? 14;
  const longBelow = params.longBelow ?? 30;
  const shortAbove = params.shortAbove ?? 70;
  const exitMid = params.exitMid ?? 50;
  const trendPeriod = params.trendPeriod ?? 200;

  const rsi = RSI.calculate({ values: ctx.closes, period });
  const rsiOffset = ctx.closes.length - rsi.length;

  let sma: number[] = [];
  let smaOffset = 0;
  if (trendPeriod > 0) {
    sma = SMA.calculate({ values: ctx.closes, period: trendPeriod });
    smaOffset = ctx.closes.length - sma.length;
  }

  const shortExit = 100 - exitMid;
  const levels: Level[] = new Array(ctx.closes.length).fill("neutral");
  let state: Level = "neutral";

  for (let i = 0; i < ctx.closes.length; i++) {
    const r = i >= rsiOffset ? rsi[i - rsiOffset] : undefined;
    if (r === undefined) {
      levels[i] = "neutral"; // 指标预热期
      continue;
    }
    const trendReady = trendPeriod === 0 || i >= smaOffset;
    const ma = trendPeriod > 0 && i >= smaOffset ? sma[i - smaOffset] : undefined;
    const inUptrend = trendPeriod === 0 || (ma !== undefined && ctx.closes[i] > ma);
    const inDowntrend = trendPeriod === 0 || (ma !== undefined && ctx.closes[i] < ma);

    // 先判退出（回到中位）
    if (state === "long" && r >= exitMid) state = "neutral";
    else if (state === "short" && r <= shortExit) state = "neutral";

    // 再判入场（仅从空仓进，且趋势就绪）
    if (state === "neutral" && trendReady) {
      if (r < longBelow && inUptrend) state = "long";
      else if (r > shortAbove && inDowntrend) state = "short";
    }

    levels[i] = state;
  }
  return levels;
}

// ---------- macd ----------
function seriesMacd(params: StrategyParams, ctx: SeriesContext): Level[] {
  const fastPeriod = params.fast ?? 12;
  const slowPeriod = params.slow ?? 26;
  const signalPeriod = params.signal ?? 9;
  const tol = params.histTolerance ?? 0;
  const vals = MACD.calculate({
    values: ctx.closes,
    fastPeriod,
    slowPeriod,
    signalPeriod,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
  });
  const offset = ctx.closes.length - vals.length;
  return ctx.closes.map((_, i) => {
    if (i < offset) return "neutral";
    const v = vals[i - offset];
    const hist = v?.histogram;
    if (hist === undefined) return "neutral";
    if (hist > tol) return "long";
    if (hist < -tol) return "short";
    return "neutral";
  });
}

// ---------- roc_momentum ----------
function seriesRocMomentum(params: StrategyParams, ctx: SeriesContext): Level[] {
  const period = params.period ?? 252;
  const longAbove = params.longAbove ?? 10;
  const shortBelow = params.shortBelow ?? -10;
  const vals = ROC.calculate({ values: ctx.closes, period });
  const offset = ctx.closes.length - vals.length;
  return ctx.closes.map((_, i) => {
    if (i < offset) return "neutral";
    const r = vals[i - offset];
    if (r > longAbove) return "long";
    if (r < shortBelow) return "short";
    return "neutral";
  });
}

// ---------- donchian ----------
function seriesDonchian(params: StrategyParams, ctx: SeriesContext): Level[] {
  const period = params.period ?? 252;
  const levels: Level[] = [];
  for (let i = 0; i < ctx.candles.length; i++) {
    if (i < period) {
      levels.push("neutral");
      continue;
    }
    const windowHighs = ctx.highs.slice(i - period, i); // 不含 i
    const windowLows = ctx.lows.slice(i - period, i);
    const upper = Math.max(...windowHighs);
    const lower = Math.min(...windowLows);
    const close = ctx.closes[i];
    if (close >= upper) levels.push("long");
    else if (close <= lower) levels.push("short");
    else levels.push("neutral");
  }
  return levels;
}

// ---------- bb_reversion ----------
function seriesBbReversion(params: StrategyParams, ctx: SeriesContext): Level[] {
  const period = params.period ?? 20;
  const stdDev = params.stdDev ?? 2;
  const vals = BollingerBands.calculate({ period, stdDev, values: ctx.closes });
  const offset = ctx.closes.length - vals.length;
  return ctx.closes.map((close, i) => {
    if (i < offset) return "neutral";
    const v = vals[i - offset];
    if (close < v.lower) return "long";   // 跌破下轨 = 均值回归买入
    if (close > v.upper) return "short";  // 上穿上轨 = 卖出
    return "neutral";
  });
}

// ---------- candle_pattern ----------
// 经典反转形态：检测 6 种形态，触发后维持 holdBars 根 long/short，之后回到 neutral。
// trendPeriod > 0 时启用趋势上下文过滤：仅在 close < MA 时接受看涨反转、close > MA 时接受看跌反转。
type PatternHit = "bullish" | "bearish" | null;

function detectPattern(ctx: SeriesContext, i: number): { hit: PatternHit; name: string } {
  const c = ctx.candles[i];
  const prev = i >= 1 ? ctx.candles[i - 1] : null;
  const prev2 = i >= 2 ? ctx.candles[i - 2] : null;

  if (isBullishHammer(c)) return { hit: "bullish", name: "锤子线" };
  if (prev && isBullishEngulfing(prev, c)) return { hit: "bullish", name: "看涨吞没" };
  if (prev2 && prev && isMorningStar(prev2, prev, c)) return { hit: "bullish", name: "晨星" };

  if (isShootingStar(c)) return { hit: "bearish", name: "射击之星" };
  if (prev && isBearishEngulfing(prev, c)) return { hit: "bearish", name: "看跌吞没" };
  if (prev2 && prev && isEveningStar(prev2, prev, c)) return { hit: "bearish", name: "暮星" };

  return { hit: null, name: "" };
}

function isBullishHammer(c: Candle): boolean {
  const body = Math.abs(c.close - c.open);
  const range = c.high - c.low;
  if (range === 0 || body === 0) return false;
  const lowerShadow = Math.min(c.open, c.close) - c.low;
  const upperShadow = c.high - Math.max(c.open, c.close);
  return lowerShadow >= 2 * body && upperShadow <= body * 0.3 && body / range <= 0.35;
}

function isShootingStar(c: Candle): boolean {
  const body = Math.abs(c.close - c.open);
  const range = c.high - c.low;
  if (range === 0 || body === 0) return false;
  const lowerShadow = Math.min(c.open, c.close) - c.low;
  const upperShadow = c.high - Math.max(c.open, c.close);
  return upperShadow >= 2 * body && lowerShadow <= body * 0.3 && body / range <= 0.35;
}

function isBullishEngulfing(prev: Candle, curr: Candle): boolean {
  return (
    prev.close < prev.open &&
    curr.close > curr.open &&
    curr.open <= prev.close &&
    curr.close >= prev.open
  );
}

function isBearishEngulfing(prev: Candle, curr: Candle): boolean {
  return (
    prev.close > prev.open &&
    curr.close < curr.open &&
    curr.open >= prev.close &&
    curr.close <= prev.open
  );
}

function isMorningStar(c1: Candle, c2: Candle, c3: Candle): boolean {
  const body1 = Math.abs(c1.close - c1.open);
  const body2 = Math.abs(c2.close - c2.open);
  const body3 = Math.abs(c3.close - c3.open);
  if (body1 === 0 || body3 === 0) return false;
  const mid1 = (c1.open + c1.close) / 2;
  return (
    c1.close < c1.open &&
    body1 > body2 * 2 &&
    c3.close > c3.open &&
    body3 > body2 * 2 &&
    c3.close > mid1
  );
}

function isEveningStar(c1: Candle, c2: Candle, c3: Candle): boolean {
  const body1 = Math.abs(c1.close - c1.open);
  const body2 = Math.abs(c2.close - c2.open);
  const body3 = Math.abs(c3.close - c3.open);
  if (body1 === 0 || body3 === 0) return false;
  const mid1 = (c1.open + c1.close) / 2;
  return (
    c1.close > c1.open &&
    body1 > body2 * 2 &&
    c3.close < c3.open &&
    body3 > body2 * 2 &&
    c3.close < mid1
  );
}

function seriesCandlePattern(params: StrategyParams, ctx: SeriesContext): Level[] {
  const holdBars = params.holdBars ?? 5;
  const trendPeriod = params.trendPeriod ?? 20;
  const levels: Level[] = new Array(ctx.candles.length).fill("neutral");

  let sma: number[] = [];
  let smaOffset = 0;
  if (trendPeriod > 0) {
    sma = SMA.calculate({ values: ctx.closes, period: trendPeriod });
    smaOffset = ctx.closes.length - sma.length;
  }

  for (let i = 0; i < ctx.candles.length; i++) {
    const { hit } = detectPattern(ctx, i);
    if (!hit) continue;

    // 趋势过滤：看涨形态需在 MA 下方，看跌形态需在 MA 上方
    if (trendPeriod > 0) {
      if (i < smaOffset) continue; // 预热期数据不足，丢弃信号
      const ma = sma[i - smaOffset];
      const close = ctx.closes[i];
      if (hit === "bullish" && close >= ma) continue;
      if (hit === "bearish" && close <= ma) continue;
    }

    const target: Level = hit === "bullish" ? "long" : "short";
    for (let j = 0; j <= holdBars && i + j < ctx.candles.length; j++) {
      levels[i + j] = target;
    }
  }
  return levels;
}

// ---------- selling_climax ----------
// VSA / Wyckoff 卖出高潮：下跌趋势末端放量+长下影+累计跌幅 = 见底信号。
// 只发 long，不发 short（顶部对应的 buying climax 是另一种形态，本策略不覆盖）。
function seriesSellingClimax(params: StrategyParams, ctx: SeriesContext): Level[] {
  const lookback = params.lookback ?? 10;
  const volumeMultiple = params.volumeMultiple ?? 1.8;
  const tailRatio = params.tailRatio ?? 0.01;
  const drawdownPct = params.drawdownPct ?? -5;
  const holdBars = params.holdBars ?? 10;
  const trendPeriod = params.trendPeriod ?? 20;
  const requireConfirmation = params.requireConfirmation ?? true;
  const levels: Level[] = new Array(ctx.candles.length).fill("neutral");

  let sma: number[] = [];
  let smaOffset = 0;
  if (trendPeriod > 0) {
    sma = SMA.calculate({ values: ctx.closes, period: trendPeriod });
    smaOffset = ctx.closes.length - sma.length;
  }

  for (let i = lookback; i < ctx.candles.length; i++) {
    const c = ctx.candles[i];

    // 1. 趋势过滤：必须在下跌趋势中
    if (trendPeriod > 0) {
      if (i < smaOffset) continue;
      if (c.close >= sma[i - smaOffset]) continue;
    }

    // 2. 放量：今日量 ≥ 前 lookback 日均量 × volumeMultiple
    const window = ctx.candles.slice(i - lookback, i);
    const avgVol = window.reduce((a, b) => a + b.volume, 0) / lookback;
    if (avgVol <= 0 || c.volume < avgVol * volumeMultiple) continue;

    // 3. 长下影 / 盘中收回：(close - low) / low ≥ tailRatio
    if (c.low <= 0) continue;
    if ((c.close - c.low) / c.low < tailRatio) continue;

    // 4. 累计跌幅：lookback 日前 close 到今日 close 的跌幅 ≤ drawdownPct
    const refClose = ctx.candles[i - lookback].close;
    if (refClose <= 0) continue;
    const cumReturn = ((c.close - refClose) / refClose) * 100;
    if (cumReturn > drawdownPct) continue;

    // 次日确认：要求 i+1 收盘 > i 收盘，信号生效日推迟到 i+1
    if (requireConfirmation) {
      if (i + 1 >= ctx.candles.length) continue;
      if (ctx.candles[i + 1].close <= c.close) continue;
      for (let j = 0; j <= holdBars && i + 1 + j < ctx.candles.length; j++) {
        levels[i + 1 + j] = "long";
      }
    } else {
      for (let j = 0; j <= holdBars && i + j < ctx.candles.length; j++) {
        levels[i + j] = "long";
      }
    }
  }
  return levels;
}

// ---------- buying_climax ----------
// 买入高潮：上涨趋势中放量长上影 + 累计涨幅 = 顶部派发。镜像于 selling_climax。
// 只发 short，long-only 回测不会有交易记录；纯粹用于推送顶部告警 / 提醒减仓。
function seriesBuyingClimax(params: StrategyParams, ctx: SeriesContext): Level[] {
  const lookback = params.lookback ?? 10;
  const volumeMultiple = params.volumeMultiple ?? 1.8;
  const tailRatio = params.tailRatio ?? 0.01;
  const gainPct = params.gainPct ?? 5;
  const holdBars = params.holdBars ?? 10;
  const trendPeriod = params.trendPeriod ?? 20;
  const requireConfirmation = params.requireConfirmation ?? true;
  const levels: Level[] = new Array(ctx.candles.length).fill("neutral");

  let sma: number[] = [];
  let smaOffset = 0;
  if (trendPeriod > 0) {
    sma = SMA.calculate({ values: ctx.closes, period: trendPeriod });
    smaOffset = ctx.closes.length - sma.length;
  }

  for (let i = lookback; i < ctx.candles.length; i++) {
    const c = ctx.candles[i];

    // 1. 趋势过滤：必须在上涨趋势中
    if (trendPeriod > 0) {
      if (i < smaOffset) continue;
      if (c.close <= sma[i - smaOffset]) continue;
    }

    // 2. 放量
    const window = ctx.candles.slice(i - lookback, i);
    const avgVol = window.reduce((a, b) => a + b.volume, 0) / lookback;
    if (avgVol <= 0 || c.volume < avgVol * volumeMultiple) continue;

    // 3. 长上影 / 盘中被打回：(high - close) / high ≥ tailRatio
    if (c.high <= 0) continue;
    if ((c.high - c.close) / c.high < tailRatio) continue;

    // 4. 累计涨幅 ≥ gainPct
    const refClose = ctx.candles[i - lookback].close;
    if (refClose <= 0) continue;
    const cumReturn = ((c.close - refClose) / refClose) * 100;
    if (cumReturn < gainPct) continue;

    // 5. 次日确认：要求 i+1 收盘 < i 收盘
    if (requireConfirmation) {
      if (i + 1 >= ctx.candles.length) continue;
      if (ctx.candles[i + 1].close >= c.close) continue;
      for (let j = 0; j <= holdBars && i + 1 + j < ctx.candles.length; j++) {
        levels[i + 1 + j] = "short";
      }
    } else {
      for (let j = 0; j <= holdBars && i + j < ctx.candles.length; j++) {
        levels[i + j] = "short";
      }
    }
  }
  return levels;
}

// ---------- 详情描述（用于推送和日志）----------
function detailFor(
  kind: StrategyKind,
  params: StrategyParams,
  adjusted: Candle[],
  level: Level,
): Omit<ClassifyResult, "level"> {
  const ctx = buildContext(adjusted);
  const last = ctx.candles[ctx.candles.length - 1];
  const close = last?.close;
  switch (kind) {
    case "ma_trend": {
      const period = params.period ?? 200;
      const maFn = params.maType === "ema" ? EMA : SMA;
      const ma = maFn.calculate({ values: ctx.closes, period }).at(-1);
      return {
        values: { close, ma, period },
        description: `价格 ${close?.toFixed(2)} vs MA${period} ${ma?.toFixed(2) ?? "n/a"}`,
      };
    }
    case "ma_cross": {
      const fast = params.maFast ?? 50;
      const slow = params.maSlow ?? 200;
      const maFn = params.maType === "ema" ? EMA : SMA;
      const f = maFn.calculate({ values: ctx.closes, period: fast }).at(-1);
      const s = maFn.calculate({ values: ctx.closes, period: slow }).at(-1);
      return {
        values: { maFast: f, maSlow: s, fast, slow },
        description: `MA${fast} ${f?.toFixed(2) ?? "n/a"} vs MA${slow} ${s?.toFixed(2) ?? "n/a"}（${level === "long" ? "金叉" : level === "short" ? "死叉" : "—"}）`,
      };
    }
    case "rsi_extreme": {
      const period = params.period ?? 14;
      const rsi = RSI.calculate({ values: ctx.closes, period }).at(-1);
      return {
        values: { rsi, period, longBelow: params.longBelow ?? 30, shortAbove: params.shortAbove ?? 70 },
        description: `RSI${period} = ${rsi?.toFixed(2) ?? "n/a"}`,
      };
    }
    case "macd": {
      const fastPeriod = params.fast ?? 12;
      const slowPeriod = params.slow ?? 26;
      const signalPeriod = params.signal ?? 9;
      const v = MACD.calculate({ values: ctx.closes, fastPeriod, slowPeriod, signalPeriod, SimpleMAOscillator: false, SimpleMASignal: false }).at(-1);
      return {
        values: { macd: v?.MACD, signal: v?.signal, hist: v?.histogram },
        description: `MACD ${v?.MACD?.toFixed(3) ?? "n/a"} / Signal ${v?.signal?.toFixed(3) ?? "n/a"}`,
      };
    }
    case "roc_momentum": {
      const period = params.period ?? 252;
      const roc = ROC.calculate({ values: ctx.closes, period }).at(-1);
      return {
        values: { roc, period },
        description: `${period} 日 ROC = ${roc?.toFixed(2) ?? "n/a"}%`,
      };
    }
    case "donchian": {
      const period = params.period ?? 252;
      const start = Math.max(0, ctx.candles.length - period - 1);
      const end = ctx.candles.length - 1;
      const upper = Math.max(...ctx.highs.slice(start, end));
      const lower = Math.min(...ctx.lows.slice(start, end));
      return {
        values: { close, upper, lower, period },
        description: `${period} 日通道 [${lower.toFixed(2)}, ${upper.toFixed(2)}]，当前 ${close?.toFixed(2)}`,
      };
    }
    case "bb_reversion": {
      const period = params.period ?? 20;
      const stdDev = params.stdDev ?? 2;
      const v = BollingerBands.calculate({ period, stdDev, values: ctx.closes }).at(-1);
      return {
        values: { close, upper: v?.upper, lower: v?.lower, middle: v?.middle },
        description: `布林带 [${v?.lower?.toFixed(2) ?? "n/a"}, ${v?.upper?.toFixed(2) ?? "n/a"}]，当前 ${close?.toFixed(2)}`,
      };
    }
    case "buying_climax": {
      const lookback = params.lookback ?? 10;
      const volumeMultiple = params.volumeMultiple ?? 1.8;
      const tailRatio = params.tailRatio ?? 0.01;
      const gainPct = params.gainPct ?? 5;
      const last = ctx.candles[ctx.candles.length - 1];
      const startIdx = ctx.candles.length - 1 - lookback;
      const refClose = startIdx >= 0 ? ctx.candles[startIdx].close : undefined;
      const cumReturn = refClose && refClose > 0 ? ((last.close - refClose) / refClose) * 100 : undefined;
      const avgVol = startIdx >= 0
        ? ctx.candles.slice(startIdx, ctx.candles.length - 1).reduce((a, b) => a + b.volume, 0) / lookback
        : undefined;
      const volRatio = avgVol && avgVol > 0 ? last.volume / avgVol : undefined;
      const rejection = last.high > 0 ? ((last.high - last.close) / last.high) * 100 : undefined;
      const confirmNote = params.requireConfirmation === false ? "" : "｜需次日确认";
      return {
        values: { close: last.close, volRatio, cumReturn, rejectionPct: rejection, lookback, volumeMultiple, tailRatio: tailRatio * 100, gainPct },
        description: `量比 ${volRatio?.toFixed(2) ?? "n/a"}×（阈值 ${volumeMultiple}×）｜${lookback}日累计 ${cumReturn?.toFixed(1) ?? "n/a"}%（阈值 +${gainPct}%）｜上影回落 ${rejection?.toFixed(2) ?? "n/a"}%（阈值 ${(tailRatio * 100).toFixed(1)}%）${confirmNote}`,
      };
    }
    case "selling_climax": {
      const lookback = params.lookback ?? 10;
      const volumeMultiple = params.volumeMultiple ?? 1.8;
      const tailRatio = params.tailRatio ?? 0.01;
      const drawdownPct = params.drawdownPct ?? -5;
      const last = ctx.candles[ctx.candles.length - 1];
      const startIdx = ctx.candles.length - 1 - lookback;
      const refClose = startIdx >= 0 ? ctx.candles[startIdx].close : undefined;
      const cumReturn = refClose && refClose > 0 ? ((last.close - refClose) / refClose) * 100 : undefined;
      const avgVol = startIdx >= 0
        ? ctx.candles.slice(startIdx, ctx.candles.length - 1).reduce((a, b) => a + b.volume, 0) / lookback
        : undefined;
      const volRatio = avgVol && avgVol > 0 ? last.volume / avgVol : undefined;
      const recovery = last.low > 0 ? ((last.close - last.low) / last.low) * 100 : undefined;
      const confirmNote = params.requireConfirmation === false ? "" : "｜需次日确认";
      return {
        values: { close: last.close, volRatio, cumReturn, recoveryPct: recovery, lookback, volumeMultiple, tailRatio: tailRatio * 100, drawdownPct },
        description: `量比 ${volRatio?.toFixed(2) ?? "n/a"}×（阈值 ${volumeMultiple}×）｜${lookback}日累计 ${cumReturn?.toFixed(1) ?? "n/a"}%（阈值 ${drawdownPct}%）｜下影回收 ${recovery?.toFixed(2) ?? "n/a"}%（阈值 ${(tailRatio * 100).toFixed(1)}%）${confirmNote}`,
      };
    }
    case "candle_pattern": {
      const holdBars = params.holdBars ?? 5;
      const trendPeriod = params.trendPeriod ?? 20;
      // 在最近 holdBars+1 根里反向搜最新一次形态触发
      let recent: { name: string; hit: PatternHit; daysAgo: number } | null = null;
      for (let k = 0; k <= holdBars && k < ctx.candles.length; k++) {
        const idx = ctx.candles.length - 1 - k;
        const r = detectPattern(ctx, idx);
        if (r.hit) {
          recent = { name: r.name, hit: r.hit, daysAgo: k };
          break;
        }
      }
      const ma = trendPeriod > 0 ? SMA.calculate({ values: ctx.closes, period: trendPeriod }).at(-1) : undefined;
      const desc = recent
        ? `最近 ${recent.daysAgo} 日前出现【${recent.name}】，持有窗口剩余 ${Math.max(0, holdBars - recent.daysAgo)} 日`
        : `近 ${holdBars + 1} 日无形态触发`;
      const trendNote = trendPeriod > 0 && ma !== undefined ? `；MA${trendPeriod}=${ma.toFixed(2)}` : "";
      return {
        values: { close, ma, holdBars, trendPeriod },
        description: desc + trendNote,
      };
    }
  }
  return { values: {}, description: `level=${level}` };
}
