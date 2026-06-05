/**
 * SEC EDGAR 基本面数据客户端 —— 真·point-in-time（as-filed）。
 *
 * 关键：用 Company Facts API，每条 XBRL 事实都带 `filed`（申报日）。任何"截至日期 D 的
 * 基本面"只取 filed ≤ D 的最新一期 → 杜绝重述/发布滞后造成的未来函数（价值因子最大的坑）。
 *
 * SEC 要求：① 带 User-Agent 且含联系方式（设环境变量 SEC_USER_AGENT 覆盖默认）；
 *          ② ≤10 请求/秒。本模块只做最小封装，限流交给调用方（脚本里 sleep）。
 *
 * 文档：https://www.sec.gov/edgar/sec-api-documentation
 */
const SEC_UA = process.env.SEC_USER_AGENT ?? "next-repo research (wuliyichen@gmail.com)";

async function secFetch(url: string): Promise<Response> {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": SEC_UA, Accept: "application/json" } });
    if (res.ok) return res;
    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      await new Promise((r) => setTimeout(r, 500 * attempt));
      continue;
    }
    throw new Error(`SEC HTTP ${res.status} for ${url}`);
  }
  throw new Error(`SEC fetch failed: ${url}`);
}

// ---- ticker → CIK ----------------------------------------------------------
let tickerMap: Map<string, string> | null = null;

/** 解析 ticker 到 10 位补零 CIK（SEC 接口要求该格式）。结果进程内缓存。 */
export async function resolveCik(ticker: string): Promise<string | null> {
  if (!tickerMap) {
    const res = await secFetch("https://www.sec.gov/files/company_tickers.json");
    const json = (await res.json()) as Record<string, { cik_str: number; ticker: string; title: string }>;
    tickerMap = new Map();
    for (const row of Object.values(json)) tickerMap.set(row.ticker.toUpperCase(), String(row.cik_str).padStart(10, "0"));
  }
  return tickerMap.get(ticker.toUpperCase()) ?? null;
}

// ---- company facts ---------------------------------------------------------
export interface XbrlFact {
  end: string;          // 期末日（资产负债表为时点、利润表为期末）
  start?: string;       // 期初日（流量类有）
  val: number;
  filed: string;        // 申报日 —— PIT 的关键
  form: string;         // 10-K / 10-Q ...
  fy?: number;
  fp?: string;          // FY / Q1..Q4
  frame?: string;       // 如 CY2023Q1I（有则为标准化口径）
}

export interface CompanyFacts {
  cik: number;
  entityName: string;
  facts: Record<string, Record<string, { label?: string; units: Record<string, XbrlFact[]> }>>;
}

/** 拉某 CIK 的全部 XBRL 事实。 */
export async function getCompanyFacts(cik: string): Promise<CompanyFacts> {
  const res = await secFetch(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`);
  return (await res.json()) as CompanyFacts;
}

/** 取某概念在某单位下的全部事实（按 filed 升序）。taxonomy 默认 us-gaap，也可传 dei。 */
export function factSeries(facts: CompanyFacts, concept: string, unit: string, taxonomy = "us-gaap"): XbrlFact[] {
  const arr = facts.facts?.[taxonomy]?.[concept]?.units?.[unit];
  if (!arr) return [];
  return [...arr].sort((a, b) => (a.filed < b.filed ? -1 : a.filed > b.filed ? 1 : 0));
}

/**
 * Point-in-time 取值：截至 asOf（YYYY-MM-DD），只看 filed ≤ asOf 的事实，返回其中
 * 期末（end）最新的一条（同 end 取 filed 最新）。这就是"当时真实可得"的最新基本面。
 * preferForms 可限定表单类型（如只认年报 10-K）。
 */
export function pitFact(
  facts: CompanyFacts,
  concept: string,
  unit: string,
  asOf: string,
  opts: { taxonomy?: string; preferForms?: string[] } = {},
): XbrlFact | null {
  let arr = factSeries(facts, concept, unit, opts.taxonomy ?? "us-gaap").filter((f) => f.filed <= asOf);
  if (opts.preferForms) arr = arr.filter((f) => opts.preferForms!.includes(f.form));
  if (arr.length === 0) return null;
  // 期末最新优先；同期末取申报最新（重述时拿最后修订）
  return arr.reduce((best, f) =>
    f.end > best.end || (f.end === best.end && f.filed > best.filed) ? f : best,
  );
}
