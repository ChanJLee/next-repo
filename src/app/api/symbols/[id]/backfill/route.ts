import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { backfillCandles } from "@/lib/data/cache";
import { getStooqApikeyFromCookie } from "@/lib/data/stooq-key";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// 回填多年历史要拉数据 + 批量写库，给足时限（Hobby 上限）。
export const maxDuration = 60;

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  // all=1 → 拉上市以来全部历史（Stooq 复权）；否则按 days（上限放宽到 ~68y）。
  const all = req.nextUrl.searchParams.get("all") === "1";
  const days = all ? 25000 : Math.min(Math.max(Number(req.nextUrl.searchParams.get("days") ?? "730"), 30), 25000);

  const sym = await prisma.symbol.findUnique({ where: { id } });
  if (!sym) return NextResponse.json({ error: "symbol not found" }, { status: 404 });

  try {
    // 显式回填一律全量复权替换：拉新数据后整段重写，使拆股/分红后的复权重新作用到所有历史根。
    const result = await backfillCandles(id, sym.ticker, days, getStooqApikeyFromCookie(), true);
    return NextResponse.json({ ok: true, ticker: sym.ticker, days, ...result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "backfill failed" },
      { status: 502 },
    );
  }
}
