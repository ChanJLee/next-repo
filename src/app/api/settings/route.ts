import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDingTalkConfig, setDingTalkConfig } from "@/lib/settings";

export async function GET() {
  const cfg = await getDingTalkConfig();
  if (!cfg) return NextResponse.json({ webhook: "", secret: "" });
  // 不回传完整 secret，避免泄露；显示长度提示即可
  return NextResponse.json({
    webhook: cfg.webhook,
    secret: cfg.secret ? "*".repeat(Math.min(cfg.secret.length, 12)) : "",
    secretSet: !!cfg.secret,
  });
}

const Body = z.object({
  webhook: z.string().url(),
  secret: z.string().min(0).max(200),
});

export async function PUT(req: NextRequest) {
  const body = Body.parse(await req.json());
  await setDingTalkConfig(body.webhook, body.secret);
  return NextResponse.json({ ok: true });
}
