import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? "50"), 200);
  const symbolId = req.nextUrl.searchParams.get("symbolId");
  const where = symbolId ? { symbolId: Number(symbolId) } : undefined;
  const signals = await prisma.strategySignal.findMany({
    where,
    orderBy: { triggeredAt: "desc" },
    take: limit,
    include: { strategy: true, symbol: true },
  });
  return NextResponse.json(signals);
}
