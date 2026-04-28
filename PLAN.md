# 农机配件管理系统 — 实施计划

> 依据 `doc/01` ~ `doc/07` 七份产品文档，在本仓库实现一套**全栈 Web 应用**。
> 视觉风格参考 [nextjs.org](https://nextjs.org/)：极简、克制、清晰、高级。
>
> **本仓库范围**：Web 后台（前端 UI + 后端 API + 数据库）一体化交付。
> **不在本仓库范围（明确不实现）**：移动 App、微信小程序、PDA、整机厂 DMS / 物流 / 税控 / 银企等外部系统对接。

---

## 0. 阅读须知

- 项目使用 **Next.js 16.2.4 + React 19 + Tailwind CSS v4**。
- 这不是训练数据里的 Next.js — `AGENTS.md` 明确提示有破坏性变更。**写任何代码前，先读 [`node_modules/next/dist/docs/`](node_modules/next/dist/docs/) 下相关章节**，特别是 App Router、Server Components、Server Actions、Route Handlers、`use cache`、`revalidateTag` 等。
- **后端在本仓库内实现**，不再使用 [`doc/06`](doc/06-技术架构.md) 中描述的 Spring Boot 微服务架构。本计划用 **Next.js 全栈（Route Handlers + Server Actions）+ SQLite** 替代，作为产品 V1.0 的工程方案。`doc/06` 中描述的微服务、Kafka、ES、ClickHouse 等仅作为远期演进参考，V1 不引入。
- [`doc/04`](doc/04-数据模型.md) 中的实体、字段、索引、状态机仍然生效——只是落地到 SQLite 的本地表，不再分库。
- 文档版本 v1.0，目标产品版本 V1.0，对应 [`doc/07-非功能需求.md`](doc/07-非功能需求.md#710-路线图参考) 中 2026 Q3 发布范围。

---

## 1. 设计系统（nextjs.org 风格）

风格三个关键词：**极简、清晰、高级**。所有页面与组件必须先满足这三条，再谈功能。

### 1.1 视觉基调

| 维度 | 取值 | 备注 |
|------|------|------|
| 色板 | 纯黑 `#000` / 纯白 `#fff` 为主，灰阶 `zinc-50/100/200/400/600/900` 为辅 | 不要彩色斑斓；强调用纯黑或纯白 |
| 强调色 | 仅在状态、链接、图表使用，统一从 token 取 | 蓝 `#0070F3` 留给链接与主行动；语义色（success/warning/error）参考 Vercel design |
| 字体 | `Geist Sans` 全局，`Geist Mono` 用于编码 / 单号 / 数字密集场景 | Next.js 自带，`next/font/google` 加载 |
| 字号节奏 | 12 / 14 / 16 / 18 / 24 / 32 / 48，行高 1.5 / 1.2（标题） | 不引入更多字号 |
| 间距 | 8 倍数（4 / 8 / 16 / 24 / 32 / 48 / 64） | Tailwind 默认即可 |
| 圆角 | `rounded-md` (6px) 为主，卡片 `rounded-xl` (12px)，按钮 `rounded-md` | 不用大圆角 |
| 边框 | 1px `zinc-200` / `zinc-800`（暗色），不要阴影堆叠 | 用边框分层，不用 shadow |
| 阴影 | 仅悬浮元素用极轻 `shadow-sm`，hover 才显形 | 拒绝拟物 |
| 暗色模式 | 必须支持，使用 Tailwind v4 `@media (prefers-color-scheme)` + class 切换 | 与 nextjs.org 一致 |
| 动效 | 150–200ms ease，仅用于 hover / 状态切换 | 不做炫技动画 |

### 1.2 组件原型

所有交互组件都自建（不引入 Ant Design / shadcn），保持视觉一致：

- `Button` — primary（黑底白字）/ secondary（白底黑字带边）/ ghost / destructive
- `Input` / `Textarea` / `Select` / `Combobox` — 1px 边框，focus 用 `ring-1 ring-black`
- `Table` — 无斑马纹，行间细线分隔，hover 行 `bg-zinc-50`
- `Card` — `border + rounded-xl`，padding 24
- `Badge` — 状态色块极小（`text-xs`），状态机可视化主力
- `Tabs` / `Breadcrumb` / `Pagination` / `Dialog` / `Drawer` / `Toast`
- `EmptyState` / `Skeleton` / `ErrorState` — 三件套必备
- `KBD` / `Kbd` — 模仿 nextjs.org 文档的快捷键样式（命令面板用）
- `CommandPalette` — `⌘K` 全局搜索（配件、客户、机器、单号）

### 1.3 布局原型

- **Shell**：左侧固定窄导航 + 顶部薄 header（面包屑 + 全局搜索 + 用户菜单）+ 右侧主内容。
- 主内容最大宽度 `max-w-screen-2xl`，左右内边距 `px-6 / lg:px-8`。
- 列表页统一上结构：标题区（H1 + 描述 + 主行动按钮）→ 过滤区（条件 + 保存的视图）→ 表格 → 分页。
- 详情页统一：面包屑 → 标题 + 状态徽章 → 操作按钮组 → Tabs 内容区（基本信息 / 关联单据 / 流水 / 操作日志）。

### 1.4 设计 Token

落到 [`src/app/globals.css`](src/app/globals.css) 的 `@theme`（Tailwind v4 语法）：

```
--color-bg / --color-fg / --color-muted / --color-border /
--color-accent / --color-success / --color-warning / --color-danger /
--font-sans / --font-mono /
--radius-sm / --radius-md / --radius-lg
```

后续所有组件只引用 token，不写裸色值。

---

## 2. 信息架构与路由

按文档模块 → URL 一一映射，全部使用 App Router。

```
/                                    经营驾驶舱（doc/02 §2.2）
/login                               登录
/onboarding                          首次引导

# 基础数据 doc/02 §2.3
/master/parts                        配件主数据
/master/parts/[id]
/master/machine-models               机型库
/master/customers                    客户档案
/master/customers/[id]
/master/customer-machines            客户机器档案
/master/suppliers                    供应商档案
/master/warehouses                   仓库与库位
/master/price-policies               价格策略
/master/seasonal-calendar            农时日历

# 采购 doc/02 §2.4
/purchase/rfqs                       询价单
/purchase/orders                     采购订单
/purchase/orders/[id]
/purchase/receiving                  收货入库
/purchase/returns                    采购退货
/purchase/reconciliation             供应商对账

# 库存 doc/02 §2.5
/inventory                           库存查询
/inventory/transactions              出入库流水
/inventory/transfers                 调拨
/inventory/cross-region              跨区代发
/inventory/counts                    盘点
/inventory/restock-suggestions       农忙备货建议

# 销售 doc/02 §2.6
/sales/quotes                        报价单
/sales/orders                        销售订单
/sales/orders/[id]
/sales/shipments                     销售出库
/sales/returns                       销售退货
/sales/reconciliation                客户对账

# 服务与售后 doc/02 §2.7
/service/orders                      服务工单
/service/orders/[id]
/service/dispatch                    上门调度（地图 + 看板）
/service/maintenance                 保养计划
/warranty/claims                     三包索赔
/warranty/claims/[id]
/warranty/returns                    故障件返厂

# 财务 doc/02 §2.8
/finance/receivables                 应收
/finance/payables                    应付
/finance/payments                    收款 / 付款
/finance/subsidies                   政府补贴台账
/finance/invoices                    发票

# 报表 doc/02 §2.9
/analytics/sales
/analytics/inventory
/analytics/purchase
/analytics/service
/analytics/warranty
/analytics/finance
/analytics/custom                    自定义报表设计器

# 系统管理 doc/02 §2.10 + doc/05
/system/orgs                         组织架构
/system/users
/system/roles
/system/permissions
/system/workflows                    审批流设计器
/system/numbering                    单据编号规则
/system/audit-log
/system/dictionaries
/system/settings
```

### 2.1 路由组（App Router）

```
src/app/
  (auth)/login/                  无 shell，独立布局
  (app)/                         有 shell 的主应用
    layout.tsx                   左导航 + 顶 header
    page.tsx                     驾驶舱
    master/...
    purchase/...
    ...
  api/                           Route Handler，初期返回 mock，后期代理后端
```

---

## 3. 后端、数据与状态

### 3.1 后端技术栈

全栈都在本仓库的 Next.js 进程内，无独立后端服务。

| 组件 | 选型 | 理由 |
|------|------|------|
| HTTP 入口 | **Server Actions**（写操作）+ **Route Handlers**（外部 / GET 读取） | 与 React 19 表单天然集成，类型直通 |
| ORM | **Drizzle ORM** | TypeScript 原生、轻量、SQLite 一等公民、迁移工具 `drizzle-kit` 成熟 |
| 数据库驱动 | **better-sqlite3**（同步、单进程内嵌） | 性能高、API 简单；Next.js 服务端运行时下稳定 |
| 数据库 | **SQLite**，文件落在 `./data/app.db` | 单文件部署、无外部依赖、足够 V1 客户量级 |
| 校验 | **zod** | 同时给前端表单 + Server Action 入参校验，类型来源单一 |
| 鉴权 | 会话 cookie（httpOnly + signed），密码 `bcrypt` | 无第三方依赖，可控 |
| 文件 | 本地 `./data/uploads/` 目录 + Next 静态路由代理 | 不引入对象存储；图片大小限 5 MB |
| 后台任务 | Next.js 进程内调度（`node-cron` 或自实现 setInterval）| 农忙备货建议、保养提醒、库存对账每日跑一次 |
| 全文搜索 | SQLite **FTS5** 虚拟表 | 配件 / 客户 / 单号搜索，避免引入 ES |

> 与 `doc/06` 的差异：取消 Kafka / ES / ClickHouse / Flowable / 微服务拆分。所有业务逻辑在同一个 Node 进程内，按领域模块化（`src/server/<domain>/`）即可。

### 3.2 SQLite 工程约定

- **WAL 模式**：`PRAGMA journal_mode = WAL` + `synchronous = NORMAL`，保障读写并发与崩溃安全。
- **外键 + 严格模式**：`PRAGMA foreign_keys = ON`、表用 `STRICT` 关键字。
- **decimal 字段**：SQLite 无原生 decimal，金额 / 数量统一存 **TEXT**（精度保留 4 位），通过 Drizzle 自定义类型 + `decimal.js` 在应用层运算。绝不直接用 REAL。
- **审计字段**：每个表都带 `tenant_id`、`org_id`、`created_at`、`created_by`、`updated_at`、`updated_by`、`deleted_at`、`version`，与 [`doc/04`](doc/04-数据模型.md) 一致。软删除统一用 `deleted_at IS NULL` 过滤（封装在 Drizzle helper）。
- **乐观锁**：所有 update 必带 `WHERE version = ?` + `SET version = version + 1`。
- **库存并发**：`UPDATE inventory SET qty_allocated = qty_allocated + ? WHERE ... AND qty_on_hand - qty_allocated - qty_locked >= ?` 利用 SQLite 单写者特性 + 行级条件，避免 [`doc/04 §4.9.1`](doc/04-数据模型.md#491-库存扣减并发) 描述的并发问题。
- **事务**：跨表操作（销售出库 → 库存扣减 → 应收生成）用 better-sqlite3 同步事务，逻辑在 `src/server/<domain>/service.ts` 内显式 `db.transaction(() => { ... })`。
- **迁移**：`drizzle-kit generate` 产出 SQL 迁移文件，落 `drizzle/` 目录。每次启动应用前自动应用未跑的迁移（`drizzle-kit push` 仅开发，生产用 `migrate` API）。
- **种子数据**：`scripts/seed.ts` 脚本提供机型库、农时日历、品牌字典、演示客户 / 配件，便于演示和开发。
- **备份**：每日 `vacuum into ./backups/app-YYYYMMDD.db`，保留最近 30 份；通过后台任务实现。

### 3.3 数据获取与缓存

| 场景 | 方案 |
|------|------|
| 列表页、详情页首屏 | **Server Component 直接调 service 层**（不经 HTTP），`use cache` + `cacheTag` 标签化 |
| 列表筛选 / 翻页 | URL search params 驱动（可分享、可后退），用 `useSearchParams` |
| 写操作（增删改、审批） | **Server Actions**，调 service 层 → 数据库事务 → `revalidateTag` 失效缓存 |
| 外部 / 客户端 fetch（命令面板搜索等） | Route Handler `app/api/*/route.ts`，复用同一个 service 层 |
| 跨页面共享的客户端状态（开单抽屉、批量选择） | Zustand 单一 store，按需 slice |
| 表单 | React 19 `useActionState` + `useFormStatus`，配合 zod 校验 |
| 实时（工单状态、库存） | 暂不做 WebSocket，列表轮询 30s + 手动刷新；V1.5 评估 SSE |

### 3.4 服务层模式

业务逻辑放 `src/server/<domain>/`，分四层：

```
src/server/parts/
  schema.ts        # Drizzle 表定义 + zod 派生
  repository.ts    # 纯 CRUD，只依赖 db
  service.ts       # 业务规则、事务编排、状态机调用
  actions.ts       # Server Actions（'use server'），UI 直接 import
  api.ts           # Route Handler 适配（外部调用）
```

UI 一律调 `actions.ts`；Route Handler 只是 `service.ts` 的薄壳。三个入口（Server Component、Server Action、Route Handler）共用同一份 service。

### 3.5 鉴权与权限

- 登录：用户名 + 密码 → bcrypt 比对 → 签发 signed httpOnly cookie（自实现 HMAC，不引入 NextAuth，避免过度依赖）。
- 会话：cookie 中存 `userId` + `tenantId` + `orgId` + 签名，每次请求由 `middleware.ts` 校验 + 注入到 request context。
- 数据权限（[`doc/05 §5.3.2`](doc/05-角色权限.md#532-数据权限datascope)）：在 service 层强制按 `tenantId` + `orgId` + `dataScope` 过滤，**不依赖前端**。前端只按 `permission` 列表隐藏菜单 / 按钮 / 字段。
- 字段级脱敏（[`doc/05 §5.6.4`](doc/05-角色权限.md#564-数据脱敏)）：service 层在 select 后按角色脱敏，永远不把明文身份证 / 银行卡传到前端。
- 敏感字段加密（身份证、银行卡）：用 `crypto.scrypt` 派生 key，AES-256-GCM 加密落库。

---

## 4. 实施分期

按价值密度 + 依赖关系切三期。每期产出可用于客户演示的完整闭环。

### Phase 0 — 基础底座（5–7 天）

**目标**：跑通 shell、设计系统、登录、空驾驶舱，并把数据库 + 服务层骨架立起来。

前端 / 设计：

- [ ] Tailwind v4 token + 暗色模式
- [ ] Geist 字体接入（`next/font`）
- [ ] 基础组件库（Button / Input / Select / Table / Card / Badge / Dialog / Drawer / Toast / Tabs / Breadcrumb / EmptyState / Skeleton）
- [ ] App Shell：左导航 + 顶 header + 面包屑
- [ ] `⌘K` 命令面板骨架
- [ ] 经营驾驶舱占位（指标卡 + 农时提示条 + 占位图表）

后端 / 数据库：

- [ ] 接入 `better-sqlite3` + `drizzle-orm` + `drizzle-kit`
- [ ] `src/db/index.ts` 单例：开 WAL / 外键 / STRICT
- [ ] `drizzle/` 目录与首份迁移：用户、角色、权限、组织、字典、审计日志
- [ ] `scripts/seed.ts`：演示账号 + 字典数据
- [ ] `scripts/migrate.ts`：启动时自动应用迁移
- [ ] `src/server/auth/`：注册 / 登录 / cookie 签发 / bcrypt
- [ ] `middleware.ts`：未登录跳 `/login`、注入 session
- [ ] 登录页 + 真实鉴权流（不再是 mock）
- [ ] 操作日志中间件雏形（写操作自动入 `audit_log`）

**验收**：`pnpm dev` 后首次启动自动建库、跑迁移、种子；可注册 / 登录；登录后跳驾驶舱；刷新仍保持登录态；所有路由用统一 Shell + Empty State 占位，视觉与 nextjs.org 同等克制。

### Phase 1 — 核心闭环 MVP（5–7 周）

**目标**：让一家小经销商能用本系统跑完"采购 → 入库 → 库存 → 销售 → 出库 → 应收"主流程。对应 [`doc/03 §3.4`](doc/03-业务流程.md) 标准销售流程。

每个模块按 **schema → repository → service（含状态机 + 事务）→ actions → 列表页 → 详情页 → 表单** 顺序推进，分模块迁移文件独立。

模块顺序（前置依赖在前）：

1. **基础数据**（无前置）
   - 配件主数据 列表 / 详情 / 新建 / 编辑（含替换件、机型适配、农时系数 — [`doc/02 §2.3.1`](doc/02-功能模块设计.md)）
   - 机型库
   - 客户档案
   - 客户机器档案（含三包到期自动计算）
   - 供应商档案
   - 仓库与库位
   - 农时日历（年视图）
   - **配件 / 客户 FTS5 索引**（建表 + 触发器同步）
2. **库存**
   - `inventory` 余额 + `stock_transaction` 流水两表 + 一致性校验脚本
   - 库存查询（多维度 + 库龄）
   - 出入库流水（只读，按时间分桶）
   - 盘点单（创建 → 录入 → 差异 → 审核 → 自动生成调整流水）
3. **采购**
   - 采购订单（状态机：DRAFT → PENDING → APPROVED → PARTIAL_RECEIVED → RECEIVED → CLOSED）
   - 收货入库（基于采购单生成，三包件强制录序列号 → 入库写流水 + 余额）
4. **销售**
   - 报价单
   - 销售订单（机型选择器 → 适配 SKU 过滤；三包件强制登记；信用控制阻断；审核时**事务内**预占 `qty_allocated`）
   - 销售出库（分批发货 → 事务内扣 `qty_on_hand` + 释放 `qty_allocated` + 生成应收）
5. **财务（最小）**
   - 应收列表（账龄分桶）
   - 收款单（一笔核销多张，FIFO 默认）

**关键交付**：
- 所有列表页支持 URL-driven 过滤、保存视图、列设置、CSV 导出（导出走 Route Handler 流式）
- 所有详情页 Tab 结构统一：基本信息 / 关联单据 / 流水 / 操作日志
- 所有写操作走 Server Action + zod 校验 + 状态机校验 + 数据库事务
- 经营驾驶舱接入真实数据：销售额 / 库存总值 / 应收 / 待发货（聚合 SQL 直查 SQLite）

### Phase 2 — 行业差异化（3–4 周）

**目标**：交付让本系统区别于通用进销存的核心模块。

1. **服务工单**
   - 报修录入（多渠道）
   - 派单看板（地图视图先用静态坐标占位，地图 SDK 在 V1.5 接入）
   - 工单详情（状态机、拍照上传、客户签字预览）
   - 工单完成自动联动：写客户机器档案、生成应收 / 三包索赔
2. **保养计划**
   - 模板管理（按机型 × 工时阈值）
   - 保养预订单（自动生成 → 客户确认 → 转工单）
3. **三包索赔**
   - 索赔单（关联工单 + 故障件序列号 + 5 项必填资料校验）
   - 多级审批可视化时间轴（售后主管 → 区域 → 整机厂）
   - 故障件返厂物流单
4. **农忙备货建议**
   - 算法在后端，前端做建议清单视图 + 一键转多张采购单
5. **政府补贴台账**
   - 销售单标记补贴 → 资料完整性校验 → 申报状态跟踪

### Phase 3 — 多组织、报表、系统管理（3–4 周）

1. **组织 / 用户 / 角色 / 权限**
   - 四级组织树
   - 角色矩阵（菜单 / 按钮 / 字段 / 数据权限）
   - 字段级权限（成本价、信用额度等敏感字段）
2. **审批流设计器**
   - 流程画布（节点 + 连线），按单据类型 + 条件配置
3. **报表**
   - 销售 / 库存 / 采购 / 售后 / 三包 / 财务 六大固定报表
   - ECharts 图表，统一调色与排版
   - 自定义报表（拖拽设计器，V1 做基础版）
4. **系统管理**
   - 单据编号规则
   - 操作日志检索
   - 数据字典
   - 参数配置

### Phase 后（V1.5 / V2，参考 [`doc/07 §7.10`](doc/07-非功能需求.md#710-路线图参考)）

不在本期实施，但架构需为其留扩展点：
- 数据库由 SQLite 迁移到 PostgreSQL（Drizzle 同 schema 切 dialect 即可）
- 抽出独立 Node 服务 / 拆微服务
- 整机厂 DMS、物流、税控、银企等外部对接（取消"本期不做"标记）
- 多语言 / 多币种（i18n key 提前规范）
- AI 配件适配建议
- 移动 App / 小程序 / PDA（**本仓库永不实现**，未来若做将走独立仓库 + 复用本仓库的 REST / GraphQL API）

---

## 5. 目录结构

```
data/                              # 运行时数据（gitignore）
  app.db                           # SQLite 主库（WAL 文件同目录）
  uploads/                         # 上传图片 / 附件
  backups/                         # 每日备份
drizzle/                           # 迁移 SQL（受控提交）
  0000_init.sql
  meta/
scripts/
  migrate.ts                       # 启动时调用
  seed.ts                          # 演示数据
  backup.ts                        # 备份脚本

src/
  app/
    (auth)/
      login/page.tsx
    (app)/
      layout.tsx                   # Shell
      page.tsx                     # 驾驶舱
      master/
        parts/
          page.tsx                 # 列表
          [id]/page.tsx            # 详情
          new/page.tsx             # 新建
        ...
      purchase/... inventory/... sales/...
      service/... warranty/... finance/...
      analytics/... system/...
    api/                           # Route Handler（外部 / GET 读取 / 文件上传 / 导出）
      auth/[...].ts
      uploads/[...].ts
      <domain>/route.ts            # 复用 src/server/<domain>/api.ts
    globals.css                    # Tailwind v4 token
    layout.tsx                     # 字体 + html lang
  db/
    index.ts                       # better-sqlite3 单例 + PRAGMA
    schema/                        # Drizzle 表定义（按域拆文件）
      auth.ts users.ts orgs.ts
      parts.ts machine-models.ts customers.ts customer-machines.ts
      suppliers.ts warehouses.ts inventory.ts stock-transactions.ts
      purchase-orders.ts sales-orders.ts shipping-orders.ts
      service-orders.ts warranty-claims.ts
      receivables.ts payables.ts payments.ts subsidy-records.ts
      audit-log.ts dictionaries.ts
      _shared.ts                   # 通用列：tenantId/orgId/audit/version
    types.ts                       # 自定义 decimal / jsonb 类型
  server/
    auth/                          # 注册 / 登录 / session / bcrypt
    session.ts                     # cookie 签名、session 上下文
    audit.ts                       # 审计日志写入
    permissions.ts                 # 数据权限 + 字段脱敏
    state-machines/                # 单据状态机（与 doc/04 §4.9.2 一致）
    parts/
      schema.ts repository.ts service.ts actions.ts api.ts
    machine-models/...
    customers/...
    customer-machines/...
    suppliers/...
    warehouses/...
    inventory/                     # 余额 / 流水 / 调拨 / 盘点 / 一致性校验
    purchase/                      # 询价 / 采购 / 收货 / 退货 / 对账
    sales/                         # 报价 / 销售 / 出库 / 退货 / 对账
    service/                       # 工单 / 派单 / 保养
    warranty/                      # 三包索赔 / 故障件返厂
    finance/                       # 应收 / 应付 / 收付 / 补贴 / 发票
    analytics/                     # 聚合查询（直查 SQLite）
    jobs/                          # 后台任务：备份 / 农忙建议 / 保养提醒 / 对账
  components/
    ui/                            # 原子组件（Button、Input、Table…）
    shell/                         # Sidebar、Header、Breadcrumb、CommandPalette
    forms/                         # 业务表单复合组件（使用 useActionState）
    domain/                        # 业务级组件（PartPicker、MachineSelector、StatusBadge…）
  lib/
    decimal.ts                     # 金额运算封装
    format/                        # 金额、日期、脱敏显示
    validation/                    # zod schema 共享片段
    fts.ts                         # FTS5 查询助手
    csv.ts                         # 流式 CSV 导出
  hooks/
  stores/                          # Zustand
  middleware.ts                    # 鉴权拦截 + session 注入
```

**约定**：
- Server Component 与 Server Action 直接 `import` `src/server/<domain>/service.ts`，不通过 HTTP 自调。
- `src/db/schema/*` 是单一事实源，前端类型从 Drizzle infer，不再单独维护 `src/types/`。
- `'use server'` 文件只放 actions，不放业务逻辑（业务逻辑下沉到 service）。

---

## 6. 关键约定

1. **状态机集中管理**：每张单据的状态转换写在 `src/server/state-machines/`，service 层强制经过状态机；前端按钮可见性、徽章颜色从同一定义派生。与 [`doc/04 §4.9.2`](doc/04-数据模型.md#492-单据状态机) 完全一致。
2. **金额 / 数量类型**：service 层用 `decimal.js` 运算；落库为 `TEXT`；前后端传输用字符串。绝不在任何位置用 JS `number` 做金额加减。
3. **脱敏字段**：身份证 / 银行卡 / 手机号在 service 层按角色脱敏后再返回；前端只负责展示，不负责脱敏。
4. **审计**：写操作的 service 函数自动通过 `withAudit(...)` 高阶函数记录 `before` / `after` 快照入 `audit_log`，无需在每个 action 手写。
5. **事务**：所有跨表写操作必须在 `db.transaction(() => { ... })` 内；事务函数纯同步（better-sqlite3 同步特性）。
6. **错误处理**：`error.tsx` + `not-found.tsx` 每个路由组都要有；Server Action 抛错由 `useActionState` 接收为字段错误；toast 仅用于异步成功 / 失败回执。
7. **可访问性**：所有交互组件键盘可达，焦点可见，颜色对比度 ≥ AA。
8. **性能预算**（对齐 [`doc/07 §7.1`](doc/07-非功能需求.md#71-性能)）：
   - 列表页首屏 LCP ≤ 1.5s（10 万级用 server-side 分页 + 索引）
   - 单据创建提交 ≤ 1s（事务 + 单进程内调用，无网络跳转）
   - 全文搜索（命令面板）≤ 200ms（FTS5）
9. **国际化**：V1 仅中文，但所有文案走 `t('key')`，资源文件 `src/locales/zh.json` 占位，避免 V2 推倒重来。
10. **测试**：核心 service（库存扣减、状态机、价格策略、三包到期计算）写 Vitest 单测，使用内存 SQLite（`:memory:`）；E2E 用 Playwright 覆盖三条关键路径（开单、出库、工单）。

---

## 7. 里程碑

| 里程碑 | 周次 | 产出 |
|-------|------|------|
| M0 — 底座可演示 | 第 1 周 | Phase 0 完成，视觉走查通过 |
| M1 — 主数据可用 | 第 3 周 | 配件 / 机型 / 客户 / 机器 / 供应商 / 仓库 五件套完成 |
| M2 — 进销存闭环 | 第 6 周 | Phase 1 完成，可跑通采购 → 销售全链路 |
| M3 — 服务与三包 | 第 9 周 | Phase 2 完成 |
| M4 — 多组织 + 报表 | 第 12 周 | Phase 3 完成，可交付 V1.0 |

对齐 [`doc/07 §7.10`](doc/07-非功能需求.md#710-路线图参考) 的 V1.0 = 2026 Q3。

---

## 8. 风险与未决事项

| 项 | 风险 | 应对 |
|----|------|------|
| SQLite 单写者瓶颈 | 高并发写入排队（[`doc/07`](doc/07-非功能需求.md#71-性能) 订单 100 QPS 目标） | WAL + 事务粒度收紧；批量导入走单独事务；V1 客户量级足够；超出后切 PG |
| `better-sqlite3` 是 native 模块 | Next.js 构建 / 部署需 rebuild | `next.config.ts` 加 `serverExternalPackages: ['better-sqlite3']`；Dockerfile 安装 build-essential |
| Drizzle 在 Next.js 16 + Turbopack 兼容性 | 训练数据未覆盖最新版本 | 接入前先在 [`node_modules/next/dist/docs/`](node_modules/next/dist/docs/) 与 Drizzle changelog 双向核对 |
| 数据库迁移与开发热重载 | dev 中重启可能多次跑迁移 | 迁移函数幂等；用 `drizzle.meta` 跟踪已应用版本 |
| 库存一致性 | 余额表与流水表偏离 | 每日 `jobs/inventory-recheck` 跑全量校验，偏差告警 |
| 农忙备货算法 | 公式简单（[`doc/03 §3.3`](doc/03-业务流程.md#33-农忙备货流程)）但需要 1 年销售历史 | 种子数据预灌历史样本，否则降级用安全库存 |
| 地图 SDK（高德 / 百度）选型 | 影响调度看板 | 接口抽象 `MapProvider`，Phase 2 占位静态坐标，V1.5 再选型 |
| 自定义报表设计器复杂度 | 工期不可控 | V1 做"列拖拽 + 简单聚合"基础版，复杂版本延后 V1.5 |
| 文件上传安全 | 本地存储 + 直接 serve 容易被滥用 | 上传走鉴权 Route Handler；落盘用随机文件名 + 原扩展名白名单；按租户分目录 |
| Next.js 16 行为差异 | 训练数据可能过期 | 每个新 API 使用前查 [`node_modules/next/dist/docs/`](node_modules/next/dist/docs/) |

---

## 9. 立刻可以开工的第一步

1. 通读 [`node_modules/next/dist/docs/01-app/01-getting-started`](node_modules/next/dist/docs/01-app/01-getting-started) 与 02-guides 中 caching、server-actions、authentication、route-handlers、data-fetching 五章。
2. 安装依赖：`pnpm add better-sqlite3 drizzle-orm zod bcryptjs decimal.js`，dev：`pnpm add -D drizzle-kit @types/better-sqlite3 @types/bcryptjs vitest @playwright/test`
3. 在 [`src/db/index.ts`](src/db/) 建 better-sqlite3 单例（WAL / 外键 / STRICT），`drizzle.config.ts` 配置迁移目录。
4. 写第一份 schema：`auth` + `users` + `audit_log` + `dictionaries`，跑通 `drizzle-kit generate` → `scripts/migrate.ts` 自动应用。
5. 在 [`src/app/globals.css`](src/app/globals.css) 落地 Tailwind v4 设计 token；建 Button / Input / Card / Badge / Table 五件套。
6. 在 `src/server/auth/` + [`src/middleware.ts`](src/) 跑通登录 → cookie → 鉴权拦截。
7. 在 [`src/app/(app)/layout.tsx`](src/app/) 建 Shell，用 Empty State 把所有路由先建出来，确认信息架构。

完成这七步后，进入 Phase 1 基础数据模块开发。
