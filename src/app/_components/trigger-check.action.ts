"use server";

import { runCheck, type CheckReport } from "@/lib/cron/check";

/**
 * UI 按钮调用的 Server Action：直接在服务端跑 runCheck，绕开 /api/cron/check 的 CRON_SECRET 校验。
 * （那个 secret 只是给 GitHub Actions 这种外部调用方用的；UI 是已认证的同源调用）。
 */
export async function triggerCheckAction(force: boolean): Promise<CheckReport> {
  return runCheck(force);
}
