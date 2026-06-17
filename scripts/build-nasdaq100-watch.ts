/**
 * 构建「纳指 100 成分前瞻」快照（离线，每日收盘后重跑提交）。
 *
 * 验证依据（见 scripts/test-nasdaq100-*.ts）：
 *  · 闸门A：被纳入「不是赚钱信号」——可行动窗口超额≈0/为负，指数效应已被抢跑磨平。
 *    故本卡片定位为【信息参考】，绝不暗示「买它能赚」。
 *  · 闸门B：纳指年度重构主要由【市值排序】决定（增列市值中位≈剔除 2 倍）→ 排名前瞻可信；
 *    但剔除还会因「最小权重/流通/资格」发生 → 把垫底成分股标为「剔除风险」而非「必剔」。
 *
 * 做法：用 Yahoo quote.marketCap（当下值，干净准确，不走 EDGAR 拼股本）给
 *   「现有成分 ∪ 候选池」排名 → 以最小的若干成分股市值为临界线 →
 *   非成分股市值已越线者=【纳入候选区】，垫底成分股=【剔除风险区】。
 *   写入 committed 的 src/lib/data/nasdaq100-watch.json，运行时只读、零外部依赖。
 *
 * 成分名单季度才变，请偶尔手动同步 MEMBERS（来源：Nasdaq 官方 / Wikipedia 成分表）。
 * 用法：pnpm exec tsx scripts/build-nasdaq100-watch.ts
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import YahooFinance from "yahoo-finance2";

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey", "ripHistorical"] });

// 当前纳指 100 成分（~2026 中，来源 Wikipedia 成分表）。季度调整后请手动同步。
const MEMBERS = [
  "ADBE","AMD","ABNB","ALNY","GOOGL","GOOG","AMZN","AEP","AMGN","ADI","AAPL","AMAT","APP","ARM","ASML","ADSK","ADP","AXON","BKR","BKNG",
  "AVGO","CDNS","CHTR","CTAS","CSCO","CCEP","CTSH","CMCSA","CEG","CPRT","COST","CRWD","CSX","DDOG","DXCM","FANG","DASH","EA","EXC","FAST",
  "FER","FTNT","GEHC","GILD","HON","IDXX","INSM","INTC","INTU","ISRG","KDP","KLAC","KHC","LRCX","LIN","LITE","MAR","MRVL","MELI","META",
  "MCHP","MU","MSFT","MSTR","MDLZ","MPWR","MNST","NFLX","NVDA","NXPI","ORLY","ODFL","PCAR","PLTR","PANW","PAYX","PYPL","PDD","PEP","QCOM",
  "REGN","ROP","ROST","SNDK","STX","SHOP","SBUX","SNPS","TMUS","TTWO","TSLA","TXN","TRI","VRSK","VRTX","WMT","WBD","WDC","WDAY","XEL","ZS",
];

// 候选池：市值较大的纳斯达克上市【非金融】非成分股。已手动剔除两类不合资格者：
//  · 金融业（纳指排除 ICB Financials，如 HOOD/COIN/AFRM）；· 非 Nasdaq 上市（如 RDDT 在 NYSE）。
// 不求穷尽，只要把「可能逼近临界线」的大票纳入比较即可；最终由市值排名定夺。
const CANDIDATES = [
  "TTD","TEAM","ON","MDB","ENPH","ZM","ALAB","RIVN","LCID","ILMN","GFS","LULU","BIIB","SMCI","JD","BIDU","NTES","TCOM","ZTO",
  "EXPE","OKTA","ROKU","DOCU","MRNA","WBA","DLTR","FFIV","VRSN","CHKP","CDW","DKNG","CART","ARGX","ASTS",
];

const BOTTOM_N = 12; // 临界线：最小的 N 个成分股；垫底成分=剔除风险区

interface Row { ticker: string; cap: number; member: boolean }

async function fetchCaps(tickers: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  // 分批查，避免单次过大
  for (let i = 0; i < tickers.length; i += 40) {
    const batch = tickers.slice(i, i + 40);
    const raw = await yf.quote(batch, {}, { validateResult: false });
    for (const q of (Array.isArray(raw) ? raw : [raw])) {
      if (q && typeof q.marketCap === "number" && q.marketCap > 0) out.set((q.symbol as string).toUpperCase(), q.marketCap);
    }
  }
  return out;
}

async function main() {
  const universe = [...new Set([...MEMBERS, ...CANDIDATES])];
  const memberSet = new Set(MEMBERS.map((t) => t.toUpperCase()));
  console.log(`查市值：成分 ${MEMBERS.length} + 候选 ${CANDIDATES.length}（去重 ${universe.length}）`);
  const caps = await fetchCaps(universe);

  const rows: Row[] = universe
    .filter((t) => caps.has(t.toUpperCase()))
    .map((t) => ({ ticker: t.toUpperCase(), cap: caps.get(t.toUpperCase())!, member: memberSet.has(t.toUpperCase()) }));

  const missingMembers = MEMBERS.filter((t) => !caps.has(t.toUpperCase()));
  if (missingMembers.length) console.log(`⚠ 缺市值的成分股（跳过）：${missingMembers.join(", ")}`);

  const members = rows.filter((r) => r.member).sort((a, b) => a.cap - b.cap); // 升序：最小在前
  if (members.length < 50) { console.error(`成分股市值覆盖过低（${members.length}），疑似数据源异常，终止不写`); process.exit(1); }

  // 临界线 = 最小的 BOTTOM_N 个成分股里的最大者（越过它就有机会顶替进来）
  const bottomMembers = members.slice(0, BOTTOM_N);
  const cutoffCap = bottomMembers[bottomMembers.length - 1].cap;

  // 剔除风险区：垫底成分（按市值升序）；并标注是否已被某非成分股反超
  const dropRisk = bottomMembers.map((r) => ({ ticker: r.ticker, capB: +(r.cap / 1e9).toFixed(1) }));

  // 纳入候选区：非成分股中市值 ≥ 临界线者（按市值降序）
  const addCandidates = rows
    .filter((r) => !r.member && r.cap >= cutoffCap)
    .sort((a, b) => b.cap - a.cap)
    .map((r) => {
      const beats = members.filter((m) => m.cap < r.cap).length; // 反超了几个成分股
      return { ticker: r.ticker, capB: +(r.cap / 1e9).toFixed(1), beatsMembers: beats };
    });

  const snapshot = {
    asOf: new Date().toISOString().slice(0, 10),
    generatedAt: new Date().toISOString(),
    note: "信息参考，非买卖信号。纳入≈无超额收益（指数效应已被抢跑）；本卡片用于成分异动前瞻。市值排序为主因，剔除亦可能因权重/流通/资格触发。",
    cutoffCapB: +(cutoffCap / 1e9).toFixed(1),
    memberCount: members.length,
    nextReconstitution: "每年 12 月（按 11 月底市值定选）",
    addCandidates,
    dropRisk,
  };

  const outPath = join(process.cwd(), "src", "lib", "data", "nasdaq100-watch.json");
  writeFileSync(outPath, JSON.stringify(snapshot, null, 2) + "\n");
  console.log(`\n临界线 ≈ $${snapshot.cutoffCapB}B（第${BOTTOM_N}小成分）`);
  console.log(`纳入候选区（${addCandidates.length}）：${addCandidates.map((c) => `${c.ticker} $${c.capB}B(顶${c.beatsMembers})`).join("  ") || "—"}`);
  console.log(`剔除风险区（${dropRisk.length}）：${dropRisk.map((d) => `${d.ticker} $${d.capB}B`).join("  ")}`);
  console.log(`\n已写 ${outPath}`);
}

main();
