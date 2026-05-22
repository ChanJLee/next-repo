import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? "50"), 200);
  const alerts = await prisma.alert.findMany({
    orderBy: { triggeredAt: "desc" },
    take: limit,
    include: { rule: true, symbol: true },
  });
  return NextResponse.json(alerts);
}
