export const dynamic = 'force-dynamic';

// Parcelas projetadas do contrato (paridade BomControle: aba "Parcelas" por ano).
// GET  /api/pj/contracts/[id]/installments        → parcelas agrupadas por ano
// POST /api/pj/contracts/[id]/installments        → (re)projeta as parcelas (rolling 12m)

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { projectContractInstallments } from '@/lib/billing-pipeline';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !session.user.activeCompanyId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }
  const companyId = session.user.activeCompanyId;

  const contract = await prisma.contract.findFirst({ where: { id: params.id, companyId } });
  if (!contract) return NextResponse.json({ error: 'Contrato não encontrado' }, { status: 404 });

  const installments = await prisma.accountsReceivable.findMany({
    where: {
      companyId,
      sourceType: 'contract',
      sourceId: contract.id,
      status: { not: 'cancelado' },
    },
    orderBy: { dueDate: 'asc' },
    select: {
      id: true,
      billingPeriod: true,
      billingDate: true,
      dueDate: true,
      amount: true,
      billingStatus: true,
      status: true,
      nfeStatus: true,
      boletoStatus: true,
      emailStatus: true,
      receivedAt: true,
      amountReceived: true,
      reconciledAt: true,
    },
  });

  // Agrupamento por ano (UI igual ao BomControle)
  const byYear: Record<string, any[]> = {};
  installments.forEach((i, idx) => {
    const year = String(new Date(i.dueDate).getFullYear());
    byYear[year] = byYear[year] || [];
    byYear[year].push({ ...i, number: idx + 1 });
  });

  const totals = {
    quitado: installments.filter((i) => ['QUITADA', 'CONCILIADA'].includes(i.billingStatus || '')),
    atrasado: installments.filter((i) => i.billingStatus === 'VENCIDA'),
    futuro: installments.filter((i) => i.billingStatus === 'PREVISTA'),
  };

  return NextResponse.json({
    contract: { id: contract.id, title: contract.title, value: contract.value, billingDay: contract.billingDay, billingLeadDays: contract.billingLeadDays },
    byYear,
    summary: {
      quitadoCount: totals.quitado.length,
      quitadoValue: totals.quitado.reduce((s, i) => s + (i.amountReceived ?? i.amount), 0),
      atrasadoCount: totals.atrasado.length,
      atrasadoValue: totals.atrasado.reduce((s, i) => s + i.amount, 0),
      futuroCount: totals.futuro.length,
      futuroValue: totals.futuro.reduce((s, i) => s + i.amount, 0),
      indeterminado: !contract.endDate && contract.billingCycle !== 'unico',
    },
  });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !session.user.activeCompanyId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  const contract = await prisma.contract.findFirst({
    where: { id: params.id, companyId: session.user.activeCompanyId },
  });
  if (!contract) return NextResponse.json({ error: 'Contrato não encontrado' }, { status: 404 });

  try {
    const result = await projectContractInstallments(contract.id, { userId: session.user.id });
    return NextResponse.json({ ok: true, ...result });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Erro ao projetar parcelas' }, { status: 500 });
  }
}
