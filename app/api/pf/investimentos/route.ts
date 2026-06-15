export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET /api/pf/investimentos?horizon=curto|medio|longo
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const horizon = new URL(req.url).searchParams.get('horizon') || undefined;

  const where: any = { userId: session.user.id, isActive: true };
  if (horizon) where.horizon = horizon;

  const investments = await prisma.pfInvestment.findMany({
    where,
    orderBy: [{ horizon: 'asc' }, { type: 'asc' }, { name: 'asc' }],
  });

  const byHorizon = {
    curto: investments.filter((i) => i.horizon === 'curto'),
    medio: investments.filter((i) => i.horizon === 'medio'),
    longo: investments.filter((i) => i.horizon === 'longo'),
  };

  const totalApplied = investments.reduce((s, i) => s + Number(i.amount), 0);
  const totalCurrent = investments.reduce((s, i) => s + Number(i.currentValue), 0);
  const totalReturn = totalApplied > 0 ? ((totalCurrent - totalApplied) / totalApplied) * 100 : 0;

  return NextResponse.json({
    investments,
    byHorizon,
    summary: {
      totalApplied,
      totalCurrent,
      totalReturn: Math.round(totalReturn * 100) / 100,
      count: investments.length,
    },
  });
}

// POST /api/pf/investimentos
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const body = await req.json();
  const { name, institution, type, horizon, amount, currentValue, rate, rateIndex, liquidity, riskLevel, purchaseDate, maturityDate, notes } = body;

  if (!name || !institution || !type || !horizon || amount === undefined || !purchaseDate) {
    return NextResponse.json({ error: 'Campos obrigatórios: name, institution, type, horizon, amount, purchaseDate' }, { status: 400 });
  }

  const inv = await prisma.pfInvestment.create({
    data: {
      userId: session.user.id,
      name,
      institution,
      type,
      horizon,
      amount: Number(amount),
      currentValue: Number(currentValue ?? amount),
      rate: rate ? Number(rate) : null,
      rateIndex: rateIndex || null,
      liquidity: liquidity || 'no_vencimento',
      riskLevel: riskLevel || 'moderado',
      purchaseDate: new Date(purchaseDate),
      maturityDate: maturityDate ? new Date(maturityDate) : null,
      notes: notes || null,
    },
  });

  return NextResponse.json(inv, { status: 201 });
}
