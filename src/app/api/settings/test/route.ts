import { NextResponse } from "next/server";
import { getFeishuConfig } from "@/lib/settings";
import { sendFeishuCard } from "@/lib/notifier/feishu";

export const dynamic = "force-dynamic";

export async function POST() {
  const cfg = await getFeishuConfig();
  if (!cfg) return NextResponse.json({ error: "尚未配置 webhook" }, { status: 400 });

  try {
    await sendFeishuCard(cfg, {
      title: "✅ Stock Monitor 测试推送",
      headerColor: "blue",
      sections: [
        "如果你在飞书群里看到了这条消息，说明 webhook + 加签配置正确。",
      ],
      footer: `${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })} · Stock Monitor`,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
