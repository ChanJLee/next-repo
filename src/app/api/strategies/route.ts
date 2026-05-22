import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { StrategyInputSchema } from "@/lib/strategies/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const symbolId = req.nextUrl.searchParams.get("symbolId");
  const where = symbolId ? { symbolId: Number(symbolId) } : undefined;
  const list = await prisma.strategy.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { symbol: true },
  });
  return NextResponse.json(list);
}

export async function POST(req: NextRequest) {
  const json = await req.json();
  const parsed = StrategyInputSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { params, ...rest } = parsed.data;
  const duplicate = await prisma.strategy.findFirst({
    where: { symbolId: rest.symbolId, name: rest.name },
    select: { id: true },
  });
  if (duplicate) {
    return NextResponse.json({ error: `策略 "${rest.name}" 已存在` }, { status: 409 });
  }

  const created = await prisma.strategy.create({
    data: { ...rest, params: JSON.stringify(params) },
  });
  return NextResponse.json(created, { status: 201 });
}
