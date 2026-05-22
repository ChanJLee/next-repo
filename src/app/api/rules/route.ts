import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { RuleInputSchema } from "@/lib/rules/types";

export async function GET(req: NextRequest) {
  const symbolId = req.nextUrl.searchParams.get("symbolId");
  const where = symbolId ? { symbolId: Number(symbolId) } : undefined;
  const rules = await prisma.rule.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { symbol: true },
  });
  return NextResponse.json(rules);
}

export async function POST(req: NextRequest) {
  const json = await req.json();
  const parsed = RuleInputSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { params, ...rest } = parsed.data;
  const rule = await prisma.rule.create({
    data: { ...rest, params: JSON.stringify(params) },
  });
  return NextResponse.json(rule, { status: 201 });
}
