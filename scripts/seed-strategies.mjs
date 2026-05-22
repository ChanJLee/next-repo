#!/usr/bin/env node
/**
 * 给数据库里已有的所有股票批量创建默认策略组合。
 *
 * 用法：
 *   node --env-file=.env scripts/seed-strategies.mjs                # 给所有股票加默认策略
 *   node --env-file=.env scripts/seed-strategies.mjs --tickers AAPL,NVDA  # 仅给指定股票
 *
 * 重复运行不会重复插入：以 (symbolId, name) 判定是否已存在。
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// 4 条互补的默认策略：趋势 + 突破 + 动量 + 均值回归
const DEFAULT_STRATEGIES = [
  {
    name: "MA200 趋势",
    kind: "ma_trend",
    params: { period: 200, tolerance: 0.5, maType: "sma" },
    cooldownSec: 14400, // 4 小时
  },
  {
    name: "52周通道突破",
    kind: "donchian",
    params: { period: 252 },
    cooldownSec: 7200, // 2 小时
  },
  {
    name: "12月动量",
    kind: "roc_momentum",
    params: { period: 252, longAbove: 15, shortBelow: -10 },
    cooldownSec: 14400,
  },
  {
    name: "RSI 超买超卖",
    kind: "rsi_extreme",
    params: { period: 14, longBelow: 30, shortAbove: 70 },
    cooldownSec: 7200,
  },
];

function parseTickers() {
  const idx = process.argv.indexOf("--tickers");
  if (idx >= 0 && process.argv[idx + 1]) {
    return process.argv[idx + 1].split(",").map((t) => t.trim().toUpperCase()).filter(Boolean);
  }
  return null;
}

async function seed() {
  const filter = parseTickers();
  const symbols = await prisma.symbol.findMany({
    where: filter ? { ticker: { in: filter } } : undefined,
    orderBy: { ticker: "asc" },
    include: { strategies: { select: { name: true } } },
  });

  if (symbols.length === 0) {
    console.log("没有匹配的股票。先运行 seed-watchlist.mjs 添加股票。");
    return;
  }

  console.log(`📊 为 ${symbols.length} 只股票应用 ${DEFAULT_STRATEGIES.length} 条默认策略\n`);

  let created = 0;
  let skipped = 0;

  for (const sym of symbols) {
    const existing = new Set(sym.strategies.map((s) => s.name));
    const adds = DEFAULT_STRATEGIES.filter((s) => !existing.has(s.name));

    if (adds.length === 0) {
      console.log(`• ${sym.ticker.padEnd(6)} 已有全部 4 条策略，跳过`);
      skipped += DEFAULT_STRATEGIES.length;
      continue;
    }

    await prisma.strategy.createMany({
      data: adds.map((s) => ({
        symbolId: sym.id,
        name: s.name,
        kind: s.kind,
        params: JSON.stringify(s.params),
        cooldownSec: s.cooldownSec,
        enabled: true,
        currentLevel: "neutral",
      })),
    });

    created += adds.length;
    skipped += DEFAULT_STRATEGIES.length - adds.length;
    const detail = adds.map((s) => s.name).join(", ");
    console.log(`• ${sym.ticker.padEnd(6)} ✓ 新增 ${adds.length} 条: ${detail}`);
  }

  console.log(`\n完成。新增 ${created} 条策略，跳过 ${skipped} 条（已存在）。`);
}

try {
  await seed();
} finally {
  await prisma.$disconnect();
}
