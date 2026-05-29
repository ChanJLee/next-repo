/**
 * 客户端回测：一次拉够 K 线，本地对该股票下所有策略逐个跑 levelSeries + backtest。
 * 计算核心是纯函数（无服务端依赖），把 CPU 从 Hobby serverless 函数挪到浏览器。
 * 最近一次结果连同时间戳缓存到 localStorage，并按「kind+params 签名」标记，
 * 策略参数改动后旧结果会自动失效（视为未回测）。
 */
import { levelSeries } from "@/lib/strategies/classify";
import { backtest } from "@/lib/strategies/backtest";
import { StrategyKindEnum, StrategyParamsSchema } from "@/lib/strategies/types";
import type { Candle } from "@/lib/data/yahoo";
import type { StrategyVM } from "./strategies-panel";

export interface ClientSummary {
  winRate: number;
  excessReturn: number;
  totalReturn: number;
  numTrades: number;
}

// 回测窗口 = 2 年（与原服务端摘要一致）
export const BACKTEST_WINDOW_DAYS = 730;

export interface BacktestCache {
  at: number; // 回测发生的时间戳（ms）
  items: Record<number, { sig: string; summary: ClientSummary }>;
}

/** 策略签名：参数或类型一变，旧的回测结果即失效。 */
export function strategySig(s: StrategyVM): string {
  return `${s.kind}|${s.params}`;
}

function cacheKey(symbolId: number): string {
  return `backtest:${symbolId}`;
}

export function loadCache(symbolId: number): BacktestCache | null {
  try {
    const raw = localStorage.getItem(cacheKey(symbolId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.at !== "number" || typeof parsed?.items !== "object") return null;
    return parsed as BacktestCache;
  } catch {
    return null;
  }
}

function saveCache(symbolId: number, cache: BacktestCache): void {
  try {
    localStorage.setItem(cacheKey(symbolId), JSON.stringify(cache));
  } catch {
    /* localStorage 不可用时忽略 */
  }
}

/** 每条策略的预热需求；取所有策略最大值，一次拉够全员用的数据。 */
function warmupFor(s: StrategyVM): number {
  try {
    const p = JSON.parse(s.params || "{}");
    return Math.max(p.period ?? 0, (p.slow ?? 0) + (p.signal ?? 0), 50) + 10;
  } catch {
    return 60;
  }
}

interface RawCandle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * 拉一次 K 线，对所有策略本地回测，写入缓存并返回。
 * 失败的单条策略记为 "failed"，整体拉数据失败则抛错由调用方提示。
 */
export async function runAllBacktests(
  symbolId: number,
  strategies: StrategyVM[],
): Promise<{ cache: BacktestCache; failed: number[] }> {
  const maxWarmup = strategies.reduce((m, s) => Math.max(m, warmupFor(s)), 0);
  const fetchDays = Math.min(BACKTEST_WINDOW_DAYS + maxWarmup * 2, 3650);

  const res = await fetch(`/api/symbols/${symbolId}/candles?days=${fetchDays}`);
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(typeof j.error === "string" ? j.error : `拉取 K 线失败 (HTTP ${res.status})`);
  }
  const json = await res.json();
  const raw: RawCandle[] = json.candles ?? [];
  // 按交易日去重（保留最后一条）并升序：回测要求时间唯一且有序，
  // 不依赖接口侧是否已去重，客户端自带一道保险。
  const byDay = new Map<string, Candle>();
  for (const c of raw) {
    if (![c.open, c.high, c.low, c.close].every((v) => typeof v === "number" && Number.isFinite(v))) continue;
    byDay.set(c.time, {
      date: new Date(`${c.time}T00:00:00Z`),
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
    });
  }
  const candles: Candle[] = Array.from(byDay.values()).sort((a, b) => a.date.getTime() - b.date.getTime());

  const since = new Date(Date.now() - BACKTEST_WINDOW_DAYS * 86400_000);
  const start = candles.findIndex((c) => c.date >= since);

  const items: BacktestCache["items"] = {};
  const failed: number[] = [];

  for (const s of strategies) {
    const kind = StrategyKindEnum.safeParse(s.kind);
    if (!kind.success) {
      failed.push(s.id);
      continue;
    }
    let params;
    try {
      params = StrategyParamsSchema.parse(JSON.parse(s.params || "{}"));
    } catch {
      params = {};
    }
    try {
      const levels = levelSeries(kind.data, params, candles);
      const cs = start >= 0 ? candles.slice(start) : candles;
      const lv = start >= 0 ? levels.slice(start) : levels;
      const r = backtest(cs, lv);
      items[s.id] = {
        sig: strategySig(s),
        summary: {
          winRate: r.winRate,
          excessReturn: r.excessReturn,
          totalReturn: r.totalReturn,
          numTrades: r.numTrades,
        },
      };
    } catch {
      failed.push(s.id);
    }
  }

  const cache: BacktestCache = { at: Date.now(), items };
  saveCache(symbolId, cache);
  return { cache, failed };
}
