import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const Patch = z.object({ enabled: z.boolean().optional(), name: z.string().max(100).optional() });

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  const body = Patch.parse(await req.json());
  const sym = await prisma.symbol.update({ where: { id }, data: body });
  return NextResponse.json(sym);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  await prisma.symbol.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
