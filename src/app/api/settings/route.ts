import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getFeishuConfig, setFeishuConfig } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function GET() {
  const cfg = await getFeishuConfig();
  if (!cfg) return NextResponse.json({ webhook: "", secret: "", secretSet: false });
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
  await setFeishuConfig(body.webhook, body.secret);
  return NextResponse.json({ ok: true });
}
