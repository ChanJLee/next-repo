import { NextRequest, NextResponse } from "next/server";
import { runCheck } from "@/lib/cron/check";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// runCheck 要为每只标的拉外部行情/K线，串行累加很容易超过默认时限。
// Hobby 套餐函数上限 60s，这里顶满。
export const maxDuration = 60;

function unauthorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const got = req.headers.get("x-cron-secret") ?? req.nextUrl.searchParams.get("secret");
  return got !== expected;
}

export async function POST(req: NextRequest) {
  if (unauthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const force = req.nextUrl.searchParams.get("force") === "1";
  const report = await runCheck(force);
  return NextResponse.json(report);
}

export async function GET(req: NextRequest) {
  return POST(req);
}
