import { NextRequest, NextResponse } from "next/server";
import { runCheck } from "@/lib/cron/check";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
