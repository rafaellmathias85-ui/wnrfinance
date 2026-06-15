export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

async function getInv(id: string, userId: string) {
  const inv = await prisma.pfInvestment.findUnique({ where: { id } });
  if (!inv || inv.userId !== userId) return null;
  return inv;
}

// PUT /api/pf/investimentos/[id] — atualiza (inclusive valor atual)
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const inv = await getInv(params.id, session.user.id);
  if (!inv) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

  const body = await req.json();
  const updated = await prisma.pfInvestment.update({
    where: { id: params.id },
    data: {
      name: body.name,
      institution: body.institution,
      type: body.type,
      horizon: body.horizon,
      amount: body.amount !== undefined ? Number(body.amount) : undefined,
      currentValue: body.currentValue !== undefined ? Number(body.currentValue) : undefined,
      rate: body.rate !== undefined ? (body.rate ? Number(body.rate) : null) : undefined,
      rateIndex: body.rateIndex ?? undefined,
      liquidity: body.liquidity,
      riskLevel: body.riskLevel,
      purchaseDate: body.purchaseDate ? new Date(body.purchaseDate) : undefined,
      maturityDate: body.maturityDate ? new Date(body.maturityDate) : null,
      notes: body.notes ?? null,
    },
  });

  return NextResponse.json(updated);
}

// DELETE /api/pf/investimentos/[id] — soft delete
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const inv = await getInv(params.id, session.user.id);
  if (!inv) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

  await prisma.pfInvestment.update({ where: { id: params.id }, data: { isActive: false } });
  return NextResponse.json({ ok: true });
}
