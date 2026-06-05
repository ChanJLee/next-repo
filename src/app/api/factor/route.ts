import { NextRequest, NextResponse } from "next/server";
import { getFactorRank, factorMeta } from "@/lib/factor";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * 价值+动量横截面百分位。GET /api/factor?ticker=AAPL
 * 只读 committed 快照，命中参考池才有值（否则 rank=null）。
 */
export async function GET(req: NextRequest) {
  const ticker = (req.nextUrl.searchParams.get("ticker") ?? "").toUpperCase();
  if (!ticker) return NextResponse.json({ error: "missing ticker" }, { status: 400 });
  return NextResponse.json({ ...factorMeta(), rank: getFactorRank(ticker) });
}
