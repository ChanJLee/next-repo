import { NextResponse } from "next/server";
import { getDingTalkConfig } from "@/lib/settings";
import { sendDingTalkMarkdown } from "@/lib/notifier/dingtalk";

export async function POST() {
  const cfg = await getDingTalkConfig();
  if (!cfg) return NextResponse.json({ error: "尚未配置 webhook" }, { status: 400 });

  try {
    await sendDingTalkMarkdown(
      cfg,
      "Stock Monitor 测试消息",
      [
        "### ✅ Stock Monitor 测试推送",
        "",
        "如果你在钉钉群里看到了这条消息，说明 webhook + 加签配置正确。",
        "",
        `> ${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })}`,
      ].join("\n"),
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
