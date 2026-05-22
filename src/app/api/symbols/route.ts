import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { backfillCandles } from "@/lib/data/cache";

export const dynamic = "force-dynamic";

const CreateSymbol = z.object({
  ticker: z.string().min(1).max(20).transform((s) => s.trim().toUpperCase()),
  name: z.string().max(100).optional(),
});

export async function GET() {
  const symbols = await prisma.symbol.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { strategies: true } } },
  });
  return NextResponse.json(symbols);
}

export async function POST(req: NextRequest) {
  const json = await req.json();
  const parsed = CreateSymbol.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    const sym = await prisma.symbol.create({ data: parsed.data });
    // 创建后立即回填一年历史（尽力而为，失败不影响创建）
    let backfill: { inserted: number; source: string } | null = null;
    let backfillError: string | null = null;
    try {
      backfill = await backfillCandles(sym.id, sym.ticker, 365);
    } catch (e) {
      backfillError = e instanceof Error ? e.message : String(e);
    }
    return NextResponse.json({ ...sym, backfill, backfillError }, { status: 201 });
  } catch (e) {
    if (e instanceof Error && e.message.includes("Unique constraint")) {
      return NextResponse.json({ error: "ticker 已存在" }, { status: 409 });
    }
    throw e;
  }
}
