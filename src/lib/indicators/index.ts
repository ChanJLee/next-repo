import { RSI, MACD, SMA, EMA, BollingerBands } from "technicalindicators";
import type { Candle } from "@/lib/data/yahoo";

export interface IndicatorSnapshot {
  rsi?: number;
  rsiPrev?: number;
  maFast?: number;
  maSlow?: number;
  maFastPrev?: number;
  maSlowPrev?: number;
  macd?: number;
  macdSignal?: number;
  macdHist?: number;
  bbUpper?: number;
  bbLower?: number;
  bbMiddle?: number;
  avgVolume?: number;
}

export interface ComputeOptions {
  rsiPeriod?: number;
  maFast?: number;
  maSlow?: number;
  maType?: "sma" | "ema";
  macdFast?: number;
  macdSlow?: number;
  macdSignal?: number;
  bbPeriod?: number;
  bbStdDev?: number;
  volumeWindow?: number;
}

export function computeIndicators(candles: Candle[], opts: ComputeOptions = {}): IndicatorSnapshot {
  const closes = candles.map((c) => c.close);
  const volumes = candles.map((c) => c.volume);
  const snap: IndicatorSnapshot = {};

  // RSI
  const rsiPeriod = opts.rsiPeriod ?? 14;
  if (closes.length > rsiPeriod) {
    const rsiVals = RSI.calculate({ values: closes, period: rsiPeriod });
    snap.rsi = rsiVals.at(-1);
    snap.rsiPrev = rsiVals.at(-2);
  }

  // MA cross
  const fast = opts.maFast ?? 5;
  const slow = opts.maSlow ?? 20;
  const maFn = opts.maType === "ema" ? EMA : SMA;
  if (closes.length > slow) {
    const fastVals = maFn.calculate({ values: closes, period: fast });
    const slowVals = maFn.calculate({ values: closes, period: slow });
    snap.maFast = fastVals.at(-1);
    snap.maSlow = slowVals.at(-1);
    snap.maFastPrev = fastVals.at(-2);
    snap.maSlowPrev = slowVals.at(-2);
  }

  // MACD
  const macdFast = opts.macdFast ?? 12;
  const macdSlow = opts.macdSlow ?? 26;
  const macdSignal = opts.macdSignal ?? 9;
  if (closes.length > macdSlow + macdSignal) {
    const macdVals = MACD.calculate({
      values: closes,
      fastPeriod: macdFast,
      slowPeriod: macdSlow,
      signalPeriod: macdSignal,
      SimpleMAOscillator: false,
      SimpleMASignal: false,
    });
    const last = macdVals.at(-1);
    if (last) {
      snap.macd = last.MACD;
      snap.macdSignal = last.signal;
      snap.macdHist = last.histogram;
    }
  }

  // Bollinger
  const bbPeriod = opts.bbPeriod ?? 20;
  const bbStdDev = opts.bbStdDev ?? 2;
  if (closes.length > bbPeriod) {
    const bbVals = BollingerBands.calculate({
      values: closes,
      period: bbPeriod,
      stdDev: bbStdDev,
    });
    const last = bbVals.at(-1);
    if (last) {
      snap.bbUpper = last.upper;
      snap.bbMiddle = last.middle;
      snap.bbLower = last.lower;
    }
  }

  // 成交量均值
  const volWindow = opts.volumeWindow ?? 20;
  if (volumes.length >= volWindow) {
    const recent = volumes.slice(-volWindow);
    snap.avgVolume = recent.reduce((a, b) => a + b, 0) / recent.length;
  }

  return snap;
}
