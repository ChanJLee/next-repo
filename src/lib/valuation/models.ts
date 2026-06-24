/**
 * 多模型估值框架（信息参考，非买卖建议）。
 *
 * 给定一组「输入」（股价、市值、EPS、增速、自由现金流等），用五个独立角度判断
 * 当前股价是「便宜 / 合理 / 偏贵」。五个模型彼此独立、可能给出不同结论——这正是
 * 重点：单一模型容易被假设带偏，多模型交叉验证才看得清。
 *
 *   1. PE vs 自身历史   —— 当前远期 PE 相对过去 5 年均值高还是低
 *   2. PEG             —— 远期 PE ÷ 增速，1 附近为公允
 *   3. 两阶段 DCF       —— 折现自由现金流得内在价值，对比市值
 *   4. 反推 DCF         —— 当前市值隐含的永续增速，对比分析师共识（看是否透支）
 *   5. FCF 收益率       —— 自由现金流 / 市值，对比无风险利率
 *
 * 全部为纯函数：同样输入永远同样输出，便于 scripts/test-valuation.ts 校验。
 */

export type Verdict = "cheap" | "fair" | "rich";

export interface ValuationInput {
  ticker: string;
  name: string;
  /** 数据基准日 YYYY-MM-DD */
  asOf: string;
  /** 现价（美元） */
  price: number;
  /** 市值（十亿美元 B） */
  marketCapB: number;
  /** 远期 EPS（下一财年共识，美元） */
  forwardEps: number;
  /** 过去 5 年远期 PE 均值（相对历史锚） */
  hist5yForwardPe: number;
  /** 分析师共识年化增速（百分数，如 13.4 表示 13.4%） */
  consensusGrowthPct: number;
  /** DCF 自由现金流基数（十亿美元 B，建议用「正常化」口径） */
  fcfBaseB: number;
  /** 净现金（十亿美元 B；净负债则为负） */
  netCashB: number;
  /** DCF 前段（10 年）年化增速（百分数） */
  stage1GrowthPct: number;
  /** DCF 折现率（百分数） */
  discountRatePct: number;
  /** DCF 永续增速（百分数） */
  terminalGrowthPct: number;
}

export interface ModelResult {
  key: string;
  label: string;
  /** 给人看的关键数值，如 "远期 PE 19x · 历史均值 30x" */
  detail: string;
  verdict: Verdict;
}

export interface ValuationResult {
  input: ValuationInput;
  models: ModelResult[];
  /** 综合：把五个判断折算成分数（cheap=-1, fair=0, rich=+1）取均值 */
  overall: { verdict: Verdict; score: number; label: string };
}

const DCF_YEARS = 10;

/** 两阶段 DCF：返回内在股权价值（十亿美元 B）。 */
export function intrinsicValueB(
  fcfBaseB: number,
  stage1GrowthPct: number,
  discountRatePct: number,
  terminalGrowthPct: number,
  netCashB: number,
): number {
  const g1 = stage1GrowthPct / 100;
  const r = discountRatePct / 100;
  const gT = terminalGrowthPct / 100;
  if (r <= gT) throw new Error("折现率必须大于永续增速");

  let pvStage1 = 0;
  let fcf = fcfBaseB;
  for (let t = 1; t <= DCF_YEARS; t++) {
    fcf = fcf * (1 + g1);
    pvStage1 += fcf / Math.pow(1 + r, t);
  }
  const terminalValue = (fcf * (1 + gT)) / (r - gT);
  const pvTerminal = terminalValue / Math.pow(1 + r, DCF_YEARS);
  return pvStage1 + pvTerminal + netCashB;
}

/** 反推 DCF：二分搜索使内在价值 == 市值 的前段增速（百分数）。 */
export function impliedGrowthPct(input: ValuationInput): number {
  const target = input.marketCapB;
  let lo = -5;
  // 上限放宽到 80%：像 TSLA 这种市值远超正常化 FCF 的极端票，隐含增速会逼近 40%+，
  // 上限太低会把搜索夹死在天花板（反推回不到市值）。80% 足够覆盖且仍是「明显高于共识=偏贵」。
  let hi = 80;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const v = intrinsicValueB(input.fcfBaseB, mid, input.discountRatePct, input.terminalGrowthPct, input.netCashB);
    if (v < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

const pct = (x: number) => `${x >= 0 ? "" : ""}${x.toFixed(1)}%`;

function peVsHistory(input: ValuationInput): ModelResult {
  const fwdPe = input.price / input.forwardEps;
  const ratio = fwdPe / input.hist5yForwardPe;
  const verdict: Verdict = ratio < 0.9 ? "cheap" : ratio > 1.1 ? "rich" : "fair";
  return {
    key: "pe-hist",
    label: "PE vs 历史",
    detail: `远期 PE ${fwdPe.toFixed(1)}x · 5 年均值 ${input.hist5yForwardPe.toFixed(0)}x`,
    verdict,
  };
}

function peg(input: ValuationInput): ModelResult {
  const fwdPe = input.price / input.forwardEps;
  const pegRatio = fwdPe / input.consensusGrowthPct;
  const verdict: Verdict = pegRatio < 1.2 ? "cheap" : pegRatio > 1.8 ? "rich" : "fair";
  return {
    key: "peg",
    label: "PEG",
    detail: `PEG ${pegRatio.toFixed(2)}（PE ${fwdPe.toFixed(1)} ÷ 增速 ${pct(input.consensusGrowthPct)}）`,
    verdict,
  };
}

function dcf(input: ValuationInput): ModelResult {
  const iv = intrinsicValueB(input.fcfBaseB, input.stage1GrowthPct, input.discountRatePct, input.terminalGrowthPct, input.netCashB);
  const upside = (iv / input.marketCapB - 1) * 100;
  const verdict: Verdict = upside > 10 ? "cheap" : upside < -10 ? "rich" : "fair";
  return {
    key: "dcf",
    label: "两阶段 DCF",
    detail: `内在 $${(iv / 1000).toFixed(2)}T vs 市值 $${(input.marketCapB / 1000).toFixed(2)}T（${upside >= 0 ? "+" : ""}${upside.toFixed(0)}%）`,
    verdict,
  };
}

function reverseDcf(input: ValuationInput): ModelResult {
  const implied = impliedGrowthPct(input);
  const gap = implied - input.consensusGrowthPct;
  // 隐含增速明显低于共识 → 市场没透支 → 偏便宜；明显高于共识 → 已 price-in 乐观 → 偏贵
  const verdict: Verdict = gap < -0.5 ? "cheap" : gap > 2 ? "rich" : "fair";
  return {
    key: "reverse-dcf",
    label: "反推 DCF",
    detail: `市值隐含增速 ${pct(implied)} vs 共识 ${pct(input.consensusGrowthPct)}`,
    verdict,
  };
}

function fcfYield(input: ValuationInput): ModelResult {
  const y = (input.fcfBaseB / input.marketCapB) * 100;
  const verdict: Verdict = y > 5 ? "cheap" : y < 3 ? "rich" : "fair";
  return {
    key: "fcf-yield",
    label: "FCF 收益率",
    detail: `${y.toFixed(1)}%（自由现金流 $${input.fcfBaseB}B ÷ 市值）`,
    verdict,
  };
}

const SCORE: Record<Verdict, number> = { cheap: -1, fair: 0, rich: 1 };

export function evaluate(input: ValuationInput): ValuationResult {
  const models = [peVsHistory(input), peg(input), dcf(input), reverseDcf(input), fcfYield(input)];
  const score = models.reduce((s, m) => s + SCORE[m.verdict], 0) / models.length;
  const verdict: Verdict = score > 0.2 ? "rich" : score < -0.2 ? "cheap" : "fair";
  const label = score > 0.2 ? "偏贵" : score < -0.2 ? "偏低估" : score < 0 ? "合理 · 偏下沿" : score > 0 ? "合理 · 偏上沿" : "合理";
  return { input, models, overall: { verdict, score, label } };
}

export const VERDICT_LABEL: Record<Verdict, string> = { cheap: "偏便宜", fair: "合理", rich: "偏贵" };
