import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const Patch = z.object({
  enabled: z.boolean().optional(),
  name: z.string().min(1).max(60).optional(),
  cooldownSec: z.number().int().min(60).max(86400).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  const body = Patch.parse(await req.json());
  const r = await prisma.strategy.update({ where: { id }, data: body });
  return NextResponse.json(r);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const id = Number(params.id);
  await prisma.strategy.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
