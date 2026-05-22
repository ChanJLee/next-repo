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

## 快速开始

```bash
# 1. 安装依赖
pnpm install

# 2. 初始化数据库（已在安装过程中自动 generate）
pnpm db:push

# 3. 启动 dev
pnpm dev
# → http://localhost:3000
```

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

```
DATABASE_URL=file:../data/dev.db
CRON_SECRET=local-dev-secret-change-me   # cron 接口校验，强烈建议改成随机串
```

## 注意事项

- `yahoo-finance2` 偶尔会限流/超时，单只股票失败不会影响其他股票
- 节假日时 yahoo 会返回前一交易日数据，cooldown 机制兜底防止重复推送
- 数据库放在 `/data/`（已被 `.gitignore` 忽略），不会进 git
