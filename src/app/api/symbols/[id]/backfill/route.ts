import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { backfillCandles } from "@/lib/data/cache";
import { getStooqApikeyFromCookie } from "@/lib/data/stooq-key";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  const days = Math.min(Math.max(Number(req.nextUrl.searchParams.get("days") ?? "730"), 30), 3650);

  const sym = await prisma.symbol.findUnique({ where: { id } });
  if (!sym) return NextResponse.json({ error: "symbol not found" }, { status: 404 });

  try {
    const result = await backfillCandles(id, sym.ticker, days, getStooqApikeyFromCookie());
    return NextResponse.json({ ok: true, ticker: sym.ticker, days, ...result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "backfill failed" },
      { status: 502 },
    );
  }
}
