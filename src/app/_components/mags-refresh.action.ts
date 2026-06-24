"use server";

import { getMagsSnapshot, type MagsSnapshot } from "@/lib/mags/snapshot";

/** 首页「抄作业卡」刷新按钮调用：服务端重新拉一遍 MAGS 行情快照。 */
export async function refreshMagsAction(): Promise<MagsSnapshot> {
  return getMagsSnapshot();
}
