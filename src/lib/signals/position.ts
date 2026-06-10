// 持仓状态 + 止盈/买入触发信号。
//
// 设计原则：**不预测明天涨跌**（日线方向≈随机游走，实测 AUC≈0.5）。
// 只做两件能落地的事：
//   1) 标注「当前处于什么状态」——趋势结构 / 位置乖离 / 动能(RSI) / 波动率；
//   2) 给「风险/机会触发信号」——基于 TD 九转(Countdown 13) 与超买/超卖+结构，
//      作为止盈(减仓) / 买入(加仓) 的提示，而非"会涨/会跌"的断言。
//
// 触发的逐根定义集中在 triggersAt()，assessPosition（看板用最新窗口）与
// triggerEvents（回测用全历史）共用它，保证线上与回测的信号完全一致、不漂移。
import { RSI, SMA, ATR } from "technicalindicators";
import type { Candle } from "@/lib/data/yahoo";
import { computeTDSequential, type TDSequentialResult } from "@/lib/indicators/nine-turn";

export type Tone = "pos" | "neg" | "warn" | "neutral";

export interface StateLabel {
  key: string;
  label: string;
  value: string;
  tone: Tone;
  hint?: string;
}

export interface TriggerSignal {
  side: "sell" | "buy";
  key: string;
  title: string;
  reason: string;
  strength: "strong" | "medium";
  date: string;
}

export interface TriggerEvent extends TriggerSignal {
  index: number;
}

// 各信号的历史可靠度——来自 scripts/backtest-signals.ts 在「多样化标的池」
// （34 只：下跌/震荡/防御/板块ETF + 少量赢家，~31 万根日线）上的走查回测。
// edge10 = 信号后 10 日相对无条件基准的平均超额收益（止盈应为负、买入应为正）。
// 数字小但方向一致；仅赢家股样本上会被趋势掩盖（接近 0）。诚实展示，不夸大。
export interface SignalReliability { edge10: number; n: number }
export const SIGNAL_RELIABILITY: Record<string, SignalReliability> = {
  "sell:overbought": { edge10: -0.0029, n: 6258 },
  "sell:td13": { edge10: -0.0014, n: 2407 },
  "buy:dip_in_uptrend": { edge10: 0.0028, n: 1953 },
  "buy:td13": { edge10: 0.004, n: 1390 },
};
export const reliabilityOf = (s: { side: string; key: string }): SignalReliability | undefined =>
  SIGNAL_RELIABILITY[`${s.side}:${s.key}`];

export interface PositionAssessment {
  asOf: string;
  states: StateLabel[];
  active: TriggerSignal[];
  recent: TriggerSignal[];
}

const MIN_BARS = 210;       // MA200 + 余量
const RECENT_BARS = 60;     // 最近触发回看窗口

const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

function dailyVol(closes: number[], i: number, p = 20): number {
  if (i < p) return 0.02;
  const r: number[] = [];
  for (let j = i - p + 1; j <= i; j++) if (closes[j - 1] > 0) r.push(Math.log(closes[j] / closes[j - 1]));
  const m = mean(r);
  return Math.max(0.005, Math.sqrt(mean(r.map((x) => (x - m) ** 2))));
}

// 严格已实现波动率（无 0.02 兜底；样本不足返回 null），供前瞻波动预测复用。
function realizedVol(closes: number[], i: number, p: number): number | null {
  if (i < p) return null;
  const r: number[] = [];
  for (let j = i - p + 1; j <= i; j++) if (closes[j - 1] > 0 && closes[j] > 0) r.push(Math.log(closes[j] / closes[j - 1]));
  if (r.length < 2) return null;
  const m = mean(r);
  const v = Math.sqrt(mean(r.map((x) => (x - m) ** 2)));
  return v > 0 ? v : null;
}

export interface VolForecast {
  recentAnn: number;   // 当前 look 日已实现年化波动
  forecastAnn: number; // 预测未来 H 日年化波动
  pct: number;         // forecast 在该股历史已实现波动分布中的分位（0..1）
  beta: number;        // 点-时拟合的均值回归斜率（<1 表示向长期均值回归）
}

/**
 * 前瞻波动率预测（point-in-time，无未来函数）。
 * 经 scripts/_voltest.ts 走查验证：未来 H 日已实现波动率高度可预测——9 标的 5.8 万样本上
 * 滚动 CV 池化 OOS R²=0.62、6/6 折为正、rankIC≈0.72、斜率稳定≈0.77（波动率均值回归）。
 * 这是与「方向不可预测」相反的一面：方向≈随机游走，但波动会聚集且向长期均值回归。
 *
 * 实现：在该股自身历史上回归 log(未来H日波动) ~ log(近look日波动)，只用 index i 之前
 * 已揭晓结局的样本对（j+H ≤ i），故对最新一根 live 调用天然无未来函数。再用拟合的 (a,b)
 * 把当前近端波动外推为未来波动预测，并据此给反波动仓位建议（目标=历史中位波动→1x）。
 */
export function forwardVolForecast(closes: number[], i: number, H = 20, look = 20): VolForecast | null {
  const ANN = Math.sqrt(252);
  const cur = realizedVol(closes, i, look);
  if (cur == null) return null;

  // 点-时训练对：x=log(近端波动)，y=log(其后 H 日波动)；只取结局已在 i 揭晓者（j+H ≤ i）
  const xs: number[] = [], ys: number[] = [], histVol: number[] = [];
  for (let j = look; j + H <= i; j++) {
    const rv = realizedVol(closes, j, look);
    const fwd = realizedVol(closes, j + H, H);
    if (rv == null || fwd == null) continue;
    xs.push(Math.log(rv)); ys.push(Math.log(fwd)); histVol.push(rv);
  }
  if (xs.length < 60) return null; // 训练样本不足 → 不给前瞻预测

  const mx = mean(xs), my = mean(ys);
  let sxx = 0, sxy = 0;
  for (let k = 0; k < xs.length; k++) { sxx += (xs[k] - mx) ** 2; sxy += (xs[k] - mx) * (ys[k] - my); }
  const beta = sxx > 0 ? Math.min(1.2, Math.max(0, sxy / sxx)) : 0;
  const alpha = my - beta * mx;
  const forecastDaily = Math.exp(alpha + beta * Math.log(cur));

  const sorted = [...histVol].sort((a, b) => a - b);
  const pct = sorted.length ? sorted.filter((v) => v <= forecastDaily).length / sorted.length : 0.5;

  return {
    recentAnn: cur * ANN,
    forecastAnn: forecastDaily * ANN,
    pct,
    beta: +beta.toFixed(3),
  };
}

/**
 * 逐根前瞻波动率预测序列（点-时、无未来函数）——给图表画"风险环境曲线"用。
 * 等价于在每根 i 调用 forwardVolForecast，但用增量回归（随 i 推进只新增一对已揭晓的训练样本）
 * 把整体复杂度降到 ~O(n·look)。返回每根的预测年化波动；训练样本不足处为 null。
 */
export function forwardVolSeries(closes: number[], H = 20, look = 20): (number | null)[] {
  const ANN = Math.sqrt(252);
  const n = closes.length;
  const out: (number | null)[] = new Array(n).fill(null);
  let cnt = 0, sx = 0, sy = 0, sxx = 0, sxy = 0; // log(近端波动)→log(其后H日波动) 的回归累计量
  for (let i = 0; i < n; i++) {
    // 新揭晓的训练对：j=i-H 的结局（i 这根的 H 日波动）此刻才已知
    const j = i - H;
    if (j >= look) {
      const rvJ = realizedVol(closes, j, look);
      const fwdJ = realizedVol(closes, i, H);
      if (rvJ != null && fwdJ != null) {
        const x = Math.log(rvJ), y = Math.log(fwdJ);
        cnt++; sx += x; sy += y; sxx += x * x; sxy += x * y;
      }
    }
    if (cnt < 60) continue;
    const cur = realizedVol(closes, i, look);
    if (cur == null) continue;
    const mx = sx / cnt, my = sy / cnt;
    const denom = sxx - cnt * mx * mx;
    const beta = denom > 0 ? Math.min(1.2, Math.max(0, (sxy - cnt * mx * my) / denom)) : 0;
    const alpha = my - beta * mx;
    out[i] = Math.exp(alpha + beta * Math.log(cur)) * ANN;
  }
  return out;
}

function padFront(arr: number[], fullLen: number): (number | null)[] {
  return [...new Array<number | null>(Math.max(0, fullLen - arr.length)).fill(null), ...arr];
}

interface Ctx {
  n: number;
  closes: number[];
  rsi: (number | null)[];
  ma20: (number | null)[];
  ma50: (number | null)[];
  ma200: (number | null)[];
  atr: (number | null)[];
  td: TDSequentialResult;
  extZ: (i: number) => number;
  date: (i: number) => string;
}

function buildCtx(candles: Candle[], rsiPeriod = 14): Ctx | null {
  const n = candles.length;
  if (n < MIN_BARS) return null;
  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const ma20 = padFront(SMA.calculate({ values: closes, period: 20 }), n);
  const extZ = (i: number): number => {
    const m = ma20[i];
    if (!m || m <= 0 || closes[i] <= 0) return 0;
    return Math.log(closes[i] / m) / (dailyVol(closes, i) * Math.sqrt(20 / 5));
  };
  return {
    n, closes,
    rsi: padFront(RSI.calculate({ values: closes, period: rsiPeriod }), n),
    ma20,
    ma50: padFront(SMA.calculate({ values: closes, period: 50 }), n),
    ma200: padFront(SMA.calculate({ values: closes, period: 200 }), n),
    atr: padFront(ATR.calculate({ high: highs, low: lows, close: closes, period: 14 }), n),
    td: computeTDSequential(candles),
    extZ,
    date: (i: number) => candles[i].date.toISOString().slice(0, 10),
  };
}

// 第 i 根上成立的触发（止盈、买入各取最强一个）——线上与回测共用
function triggersAt(ctx: Ctx, i: number): TriggerSignal[] {
  const out: TriggerSignal[] = [];
  const r = ctx.rsi[i];
  const z = ctx.extZ(i);
  const m200 = ctx.ma200[i];
  const d = ctx.date(i);
  if (ctx.td.sell13[i]) out.push({ side: "sell", key: "td13", title: "九转见顶 (TD13)", reason: "TD Sequential 卖出计数满 13，顶部反转候选——可考虑分批止盈。", strength: "strong", date: d });
  else if (r != null && r >= 70 && z >= 1.5) out.push({ side: "sell", key: "overbought", title: "超买拉伸", reason: `RSI ${Math.round(r)}、价格显著高于 20 日均线，上行空间收窄、回撤风险升高——可减仓止盈一部分。`, strength: "medium", date: d });
  if (ctx.td.buy13[i]) out.push({ side: "buy", key: "td13", title: "九转见底 (TD13)", reason: "TD Sequential 买入计数满 13，底部反转候选——可考虑分批买入。", strength: "strong", date: d });
  else if (r != null && m200 != null && r <= 35 && ctx.closes[i] > m200) out.push({ side: "buy", key: "dip_in_uptrend", title: "升势回调超卖", reason: `价在 200 日均线上方（升势）但 RSI ${Math.round(r)} 超卖，属升势中的回调——风险收益偏有利的加仓点。`, strength: "medium", date: d });
  return out;
}

/** 全历史的「事件起点」触发（上一根没有该信号才记），供回测/统计用。 */
export function triggerEvents(candles: Candle[]): TriggerEvent[] {
  const ctx = buildCtx(candles);
  if (!ctx) return [];
  const events: TriggerEvent[] = [];
  let prev = new Set<string>();
  for (let i = MIN_BARS; i < ctx.n; i++) {
    const here = triggersAt(ctx, i);
    for (const t of here) if (!prev.has(`${t.side}:${t.key}`)) events.push({ ...t, index: i });
    prev = new Set(here.map((t) => `${t.side}:${t.key}`));
  }
  return events;
}

export function assessPosition(candles: Candle[]): PositionAssessment | null {
  const ctx = buildCtx(candles);
  if (!ctx) return null;
  const { n, closes, rsi, ma20, ma50, ma200, atr, extZ, date } = ctx;
  const last = n - 1;

  // active = 最新一根成立；recent = 窗口内事件起点
  const active = triggersAt(ctx, last);
  const recent: TriggerSignal[] = [];
  let prev = new Set<string>(triggersAt(ctx, Math.max(MIN_BARS, n - RECENT_BARS) - 1).map((t) => `${t.side}:${t.key}`));
  for (let i = Math.max(MIN_BARS, n - RECENT_BARS); i < n; i++) {
    const here = triggersAt(ctx, i);
    for (const t of here) if (!prev.has(`${t.side}:${t.key}`)) recent.push(t);
    prev = new Set(here.map((t) => `${t.side}:${t.key}`));
  }
  recent.reverse();

  // ---- 当前状态标注 ----
  const states: StateLabel[] = [];
  const c = closes[last], m50 = ma50[last], m200 = ma200[last];

  if (m50 != null && m200 != null) {
    let label = "纠缠 / 转换", tone: Tone = "neutral";
    if (c > m50 && m50 > m200) { label = "多头排列（升势）"; tone = "pos"; }
    else if (c < m50 && m50 < m200) { label = "空头排列（跌势）"; tone = "neg"; }
    states.push({ key: "structure", label: "趋势结构", value: label, tone, hint: "价 / MA50 / MA200 排列" });
  }
  const z = extZ(last);
  states.push({
    key: "ext", label: "位置（距 20 日线）",
    value: z >= 1.2 ? `偏高 +${z.toFixed(1)}σ` : z <= -1.2 ? `偏低 ${z.toFixed(1)}σ` : `中性 ${z >= 0 ? "+" : ""}${z.toFixed(1)}σ`,
    tone: z >= 1.2 ? "warn" : z <= -1.2 ? "pos" : "neutral",
    hint: "波动归一化乖离",
  });
  const r = rsi[last];
  if (r != null) {
    states.push({
      key: "rsi", label: "动能 (RSI14)",
      value: `${Math.round(r)}${r >= 70 ? " 超买" : r <= 30 ? " 超卖" : ""}`,
      tone: r >= 70 ? "warn" : r <= 30 ? "pos" : "neutral",
    });
  }
  if (atr[last] != null && c > 0) {
    const cur = (atr[last] as number) / c;
    const hist: number[] = [];
    for (let i = Math.max(0, n - 252); i < n; i++) if (atr[i] != null && closes[i] > 0) hist.push((atr[i] as number) / closes[i]);
    const pct = hist.length ? hist.filter((v) => v <= cur).length / hist.length : 0.5;
    states.push({
      key: "vol", label: "波动率 (ATR%)",
      value: `${(cur * 100).toFixed(1)}%（近一年 ${Math.round(pct * 100)} 分位）`,
      tone: pct >= 0.7 ? "warn" : "neutral",
      hint: "高波动 → 减小仓位、放宽止损",
    });
  }

  // 前瞻波动率预测（点-时自拟合；波动会聚集且均值回归，OOS R²≈0.62，是真能预测的量）。
  // 纯信息：比同期 ATR% 多一层「未来 20 日波动会向长期均值回归（升/降）」。不给仓位指令。
  const vf = forwardVolForecast(closes, last);
  if (vf) {
    const trend = vf.forecastAnn > vf.recentAnn * 1.05 ? "↑放大" : vf.forecastAnn < vf.recentAnn * 0.95 ? "↓收敛" : "≈持平";
    states.push({
      key: "volfc", label: "波动预测（未来 20 日）",
      value: `年化 ${(vf.forecastAnn * 100).toFixed(0)}% ${trend}（该股 ${Math.round(vf.pct * 100)} 分位）`,
      tone: vf.pct >= 0.7 ? "warn" : vf.pct <= 0.3 ? "pos" : "neutral",
      hint: "波动会聚集+均值回归（可预测）；放大常伴随趋势转折，收敛多为盘整",
    });
  }

  return { asOf: date(last), states, active, recent };
}
