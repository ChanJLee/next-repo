#!/usr/bin/env tsx
/**
 * GitHub Actions / 本地手动用的策略评估入口。
 *
 * 用法：
 *   tsx scripts/run-check.ts            # 仅在美股开市时评估
 *   tsx scripts/run-check.ts --force    # 强制评估（忽略市场时段）
 *
 * 退出码：0 = 正常（含 skipped）；非 0 = 拉取/评估出错。
 */
import { runCheck } from "@/lib/cron/check";
import { prisma } from "@/lib/db";

async function main() {
  const force = process.argv.includes("--force");
  const t0 = Date.now();
  const report = await runCheck(force);
  const dt = ((Date.now() - t0) / 1000).toFixed(1);

  console.log(JSON.stringify({ ...report, durationSec: Number(dt) }, null, 2));

  if (report.skipped) {
    console.log(`\n[skip] ${report.skipped}`);
    return 0;
  }

  console.log(
    `\n[done] ${dt}s · symbols=${report.symbolsChecked} · strategies=${report.strategiesEvaluated} · transitions=${report.transitions} · errors=${report.errors.length}`,
  );
  return report.errors.length > 0 ? 1 : 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((e) => {
    console.error("[fatal]", e);
    process.exitCode = 2;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
