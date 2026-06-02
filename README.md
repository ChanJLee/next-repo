# Stock Monitor

美股行情指标监控 + 飞书群机器人推送，基于 Next.js 14（App Router）+ Prisma/SQLite。

## 功能

- Web 管理界面：股票/规则增删改、配置飞书机器人
- 支持指标：
  - **价格**：突破/跌破阈值、涨跌幅触线
  - **技术**：RSI、MA 金叉/死叉（SMA/EMA）、MACD 信号线穿越、布林带突破
  - **成交量**：放量（相对均量倍数）
- 美股交易时段自动判断（含周末跳过）
- 同一规则冷却去重，防止刷屏
- 飞书自定义机器人 + 签名校验，消息以 interactive card 形式发送

## 运行环境要求

| 依赖 | 版本 | 说明 |
|------|------|------|
| Node.js | **≥ 18.17**（建议 20 LTS） | Next.js 14 要求；版本过低会启动报错 |
| pnpm | **≥ 8**（建议用 corepack） | 本项目用 pnpm，仓库带 `pnpm-lock.yaml` |
| 数据库 | 本地 **SQLite**（零安装，文件型） | 由 Prisma 自动建库；生产可选 Turso（见“环境变量”） |

> 没装 pnpm：`corepack enable pnpm`（Node 自带 corepack），或 `npm i -g pnpm`。

## 快速开始

```bash
# 1. 配置环境变量（必须！缺 .env 会导致 Prisma / 启动报错）
cp .env.example .env
#   最少要有 DATABASE_URL；其余可留默认 / 留空（见“环境变量”）

# 2. 安装依赖（postinstall 会自动 prisma generate）
pnpm install

# 3. 初始化本地数据库（按 DATABASE_URL 建 SQLite 文件 + 建表）
mkdir -p data        # 确保 DATABASE_URL 指向的目录存在
pnpm db:push

# 4. 启动 dev
pnpm dev
# → http://localhost:3000
```

> 在新机器上最常见的报错：**没有 `.env`**（缺 `DATABASE_URL`）、**没跑 `pnpm db:push`**、或 **`data/` 目录不存在**。按上面 4 步走即可。

第一次打开后：

1. 进入 **设置** 页，填入飞书自定义机器人 webhook + 签名密钥 secret，点【发送测试消息】确认能收到
2. 进入 **监控列表**，添加 ticker（如 `AAPL`、`TSLA`、`NVDA`），再为每只股票加规则
3. 回到首页点【手动检查】立即跑一次

## 定时触发（macOS launchd）

`/api/cron/check` 是检查入口，需要在请求头带 `x-cron-secret: <CRON_SECRET>`（值见 `.env`）。

模板在 `scripts/com.stockmonitor.check.plist`，替换三个占位符后：

```bash
cp scripts/com.stockmonitor.check.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.stockmonitor.check.plist
# 停止
launchctl unload ~/Library/LaunchAgents/com.stockmonitor.check.plist
```

默认 5 分钟一次。非美股交易时段会被代码直接 return，不会真的拉数据。

> 前提：Next.js 进程要先跑起来（`pnpm dev` 或 `pnpm build && pnpm start`）。

## 数据源说明

- 用 `yahoo-finance2` 拉雅虎财经的免费行情，**约 15 分钟延迟**
- 无需 API Key
- 日内信号建议接 Polygon/IEX Cloud 等付费源（替换 `src/lib/data/yahoo.ts` 即可）
- **复权**：`yahoo-chart.ts` 用 `adjclose` 反推复权 OHLC（拆股+分红都调整），消除拆股假跳空。
  Stooq CSV 是未复权源，仅作兜底；要长历史建模请用复权重灌脚本。

## 概率模型拟合（量化好坏 + 进化因子权重）

校准层 = 对 9 个因子的逻辑回归：`logit(P多)=logit(baseRate)+clampTilt(Σ wₖ·tanh(fₖ))`。
权重 `DEFAULT_MODEL_PARAMS`（`market-model.ts`）可被进化拟合。完整闭环：

```bash
# 0) 先用复权长历史重灌缓存（修正拆股/分红 + 拉长；Yahoo 限流时脚本会自动退避重试）
pnpm data:rebackfill              # 或 pnpm data:rebackfill AAPL SPY QQQM

# 1) 走查式预计算特征（点-时、无未来函数，写 data/feature-cache.json，慢、只跑一次）
pnpm model:featurize

# 2) 差分进化拟合权重：每标的前 70% 训练、后 30% 样本外验证 + L2 正则防过拟合
pnpm model:fit                    # 末尾打印可直接粘贴的 DEFAULT_MODEL_PARAMS

# 3) 给任意参数打分（headline = 样本外 Brier-skill，>0 才比"永远报基准率"强）
pnpm model:eval                   # 评当前 DEFAULT_MODEL_PARAMS
pnpm model:eval data/model-params.fitted.json
```

改了 `market-model.ts` 的权重后跑 `pnpm model:eval` 即可立刻量化好坏（无需重跑 featurize，
除非动了特征工程）。指标：Brier-skill（概率校准）、AUC（方向排序）、校准分桶。

**当前结果**（9 标的、复权长历史、1.8 万行、走查样本外）：

| | 训练 | 样本外 TEST |
|---|---|---|
| Brier-skill（相对基准率） | +0.0021 | **+0.0026** |
| AUC | 0.522 | 0.524 |

- 现 `DEFAULT_MODEL_PARAMS` 即此数据上的进化最优：**再拟合样本外变化 +0.0000**，已无更多边际可榨。
- 边际小但**真实且校准良好**（高置信桶预测 0.62 ≈ 实际 0.62），符合「谦逊模型」定位。
- 数据从 691→18253 行后，小数据时的过拟合（样本外 −0.106）消失 → 转为 **+0.0026**：更多复权数据
  并未变出更大边际，但消除了过拟合、证明这点弱边际能泛化。

## 关键文件

```
src/
├── app/
│   ├── page.tsx                 # 总览（统计 + 最近告警）
│   ├── watchlist/page.tsx       # 股票/规则管理
│   ├── settings/page.tsx        # 飞书配置
│   └── api/
│       ├── symbols/             # CRUD
│       ├── rules/               # CRUD
│       ├── alerts/              # 读取
│       ├── settings/            # 飞书机器人配置 + 测试推送
│       └── cron/check/          # ★ 核心检查入口（cron 调用）
├── lib/
│   ├── data/yahoo.ts            # 行情 / K 线拉取
│   ├── indicators/              # MA / RSI / MACD / 布林 / 成交量
│   ├── rules/                   # types + evaluator
│   ├── notifier/feishu.ts       # 签名校验 + interactive card POST
│   ├── market/hours.ts          # 交易时段判断（NY 时区）
│   └── settings.ts              # 飞书配置 KV
prisma/schema.prisma             # Symbol / Rule / Alert / Setting
scripts/*.plist                  # launchd 模板
```

## 环境变量

复制 `.env.example` 为 `.env` 后按需填写。`DATABASE_URL` 必填，其余可留默认/留空。

| 变量 | 必填 | 说明 |
|------|------|------|
| `DATABASE_URL` | ✅ | 本地 SQLite 路径，默认 `file:../data/dev.db`（相对 `prisma/` 解析 → 项目根 `data/`）。**务必先 `mkdir -p data` 再 `pnpm db:push`** |
| `CRON_SECRET` | 建议 | `/api/cron/check` 校验头 `x-cron-secret`；本地随便填，部署务必改随机串 |
| `NEXT_PUBLIC_AUTH_USER_HASH`<br>`NEXT_PUBLIC_AUTH_PASS_HASH` | 可选 | 前端登录用户名/密码的 **SHA-256 哈希**。两个都留空 = **关闭登录**（本地开发免登录）。注意是 `NEXT_PUBLIC_`，**构建期注入，改了要重启 dev / 重新构建**。生成命令见 `.env.example` 注释 |
| `STOOQ_APIKEY` | 可选 | Stooq CSV API Key，批量回填历史 K 线时限额更高；不填也能用 |
| `TURSO_DATABASE_URL`<br>`TURSO_AUTH_TOKEN` | 仅生产 | 设置后走 libSQL 连远端 Turso（Vercel 用）；**本地不要设**，留空即用上面的本地 SQLite |

> 登录：`NEXT_PUBLIC_AUTH_*` 留空时整站免登录，方便本地跑；要启用就按 `.env.example` 里的命令生成哈希填进去。

## 注意事项

- `yahoo-finance2` 偶尔会限流/超时，单只股票失败不会影响其他股票
- 节假日时 yahoo 会返回前一交易日数据，cooldown 机制兜底防止重复推送
- 数据库放在 `/data/`（已被 `.gitignore` 忽略），不会进 git
