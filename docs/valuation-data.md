# 估值快照数据维护指南

本文档说明 `src/lib/data/valuation.json` 怎么更新。目标：让**廉价模型 / 人工**也能照着一步步做，不出错。

数据驱动首页的「估值快照（多模型）」卡片。定位是**信息参考，非买卖建议**。

---

## 1. 一句话结论

- **行情类字段**（价格、市值、远期 EPS、净现金、共识增速、TTM 自由现金流）→ **不用手动**，GitHub Action 每个交易日收盘后自动从 Yahoo 刷新。
- **判断类字段**（历史 PE 锚、DCF 三个假设）→ **需要手动**，数据源给不了或属于建模选择。
- 想**钉住**某个自动字段不被覆盖（比如你校准过的口径）→ 把它加进该公司的 `manualFields`。

---

## 2. 字段含义与维护方式

每家公司是 `companies` 数组里的一个对象。字段分三类：

### ① 自动刷新（脚本每天覆盖，**别手动改**，改了也会被盖掉）

| 字段 | 含义 | Yahoo 来源 |
|---|---|---|
| `price` | 现价（美元） | `regularMarketPrice` |
| `marketCapB` | 市值（十亿美元 B） | `marketCap / 1e9` |
| `forwardEps` | 下一财年共识 EPS | `epsForward` |
| `netCashB` | 净现金（B，负数=净负债） | `totalCash − totalDebt` |
| `consensusGrowthPct` | 共识增速（%，明年口径近似） | `earningsTrend「+1y」growth ×100` |
| `fcfBaseB` | 自由现金流基数（B，TTM 初值） | `freeCashflow / 1e9` |

> 想保护其中某个不被自动覆盖 → 见 §4 `manualFields`。

### ② 数据源给不了，**必须手动**

| 字段 | 含义 | 怎么填 |
|---|---|---|
| `hist5yForwardPe` | 过去 5 年远期 PE 的均值（历史估值锚） | 查 Koyfin / FactSet / 券商研报里的「5Y avg forward P/E」；没有就用近 5 年 PE 中枢估一个整数。半年~一年校一次 |

### ③ 建模假设，**按设计手动**（这是 DCF 的输入判断，不是数据）

| 字段 | 含义 | 常见区间 |
|---|---|---|
| `stage1GrowthPct` | DCF 前 10 年年化增速假设（%） | 成熟巨头 8–15；高增长 15–25 |
| `discountRatePct` | DCF 折现率（%），**必须 > 永续增速** | 大盘股 9–11 |
| `terminalGrowthPct` | DCF 永续增速（%） | 3–4（≈长期 GDP+通胀） |

---

## 3. 怎么更新（最常见的几件事）

### A. 例行更新行情 → 什么都不用做
GitHub Action `valuation-refresh.yml` 周一至周五 22:00 UTC（美股收盘后）自动跑，刷新 ① 类字段并提交。手动想跑一次：

```bash
pnpm valuation:refresh   # 等价于 tsx scripts/build-valuation.ts
```

### B. 季度 / 财报后，更新判断类字段
财报出来后，基本面口径会变，需要人工校 ② ③ 类字段（以及被你锁定的 ① 字段）：

1. 打开 `src/lib/data/valuation.json`，找到对应公司。
2. 按 §2 的表更新 `hist5yForwardPe`、`stage1GrowthPct`、`discountRatePct`、`terminalGrowthPct`。
3. 如需修正某个自动字段的口径（如「正常化」FCF 而非 TTM），改数值并把字段名加进 `manualFields`（见 §4），否则下次刷新会被盖回。
4. 跑校验（见 §5）。

### C. 新增一家公司
往 `companies` 数组追加一个对象，**所有字段都要有**（自动字段先填占位值，第一次刷新会被真实值覆盖）：

```json
{
  "ticker": "AVGO",
  "name": "博通 Broadcom",
  "asOf": "2026-06-24",
  "price": 0,
  "marketCapB": 0,
  "forwardEps": 0,
  "hist5yForwardPe": 30,
  "consensusGrowthPct": 0,
  "fcfBaseB": 0,
  "netCashB": 0,
  "stage1GrowthPct": 12,
  "discountRatePct": 9,
  "terminalGrowthPct": 4
}
```

- `ticker` 用 Yahoo 能查到的代码（美股直接用，如 `AVGO`）。
- `hist5yForwardPe` 和三个 DCF 假设要按 §2 认真填——这些不会自动刷新。
- 跑一次 `pnpm valuation:refresh` 把占位的 0 换成真实行情，再跑校验。

---

## 4. `manualFields`：锁定字段不被自动覆盖

可选数组，列出**不希望被自动刷新覆盖**的 ① 类字段名。常用于钉住你已校准的判断值。

```json
{
  "ticker": "MSFT",
  "manualFields": ["consensusGrowthPct", "fcfBaseB"],
  ...
}
```

上例中 `consensusGrowthPct` 和 `fcfBaseB` 永远用你写的值，脚本不动；其余自动字段照常刷新。

什么时候该锁：
- `fcfBaseB`：当 TTM 自由现金流被一次性 capex / 股权激励带偏，你手算了「正常化」口径时。
- `consensusGrowthPct`：当你想用「长期 5 年增速」而非 Yahoo 的「明年增速」时。
- 不要锁 `price` / `marketCapB`：这些是事实行情，锁了就失去意义。

---

## 5. 改完必须校验

```bash
pnpm exec tsx scripts/test-valuation.ts
```

会打印每家五模型结论 + 综合判断，并断言：
- 反推 DCF 能回到市值（数值自洽）；
- 每家恰好 5 个模型。

末行出现 `✓ 全部断言通过` 才算 OK。若报 `✗`，多半是 DCF 假设不合理（如 `discountRatePct ≤ terminalGrowthPct`），按提示改。

---

## 6. 数据质量提醒（廉价模型尤其注意）

Yahoo 是免费源，偶有脏数据。自动刷新后扫一眼是否离谱：

- **`forwardEps` 异常 → 远期 PE 会失真**。若某票远期 PE 明显偏离常识（如成长股 < 20x），多半是 Yahoo 的 `epsForward` 口径有问题，可手填正确值并加进 `manualFields`。
- **`fcfBaseB` 是 TTM、会抖**。重资本开支的公司（如 AMZN）某季 FCF 可能很低，不代表常态。要「正常化」就手算后锁定。
- **`consensusGrowthPct` 是「明年」增速**，不是长期。长期增速更稳时，手填并锁定。
- 修正后务必重跑 §5 校验。

---

## 7. 相关文件一览

| 文件 | 作用 |
|---|---|
| `src/lib/data/valuation.json` | 数据本体（本文档维护对象） |
| `scripts/build-valuation.ts` | 自动刷新脚本（`pnpm valuation:refresh`） |
| `scripts/test-valuation.ts` | 校验脚本（改完必跑） |
| `src/lib/valuation/models.ts` | 五模型 + 综合判断逻辑（一般不用动） |
| `src/app/_components/valuation-card.tsx` | 首页卡片渲染 |
| `.github/workflows/valuation-refresh.yml` | 每日收盘后自动刷新的 Action |
