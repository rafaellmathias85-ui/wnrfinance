export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

async function getPeriodData(companyId: string, startDate: Date, endDate: Date) {
  const [receivables, payables] = await Promise.all([
    prisma.accountsReceivable.findMany({
      where: {
        companyId,
        status: 'recebido',
        receivedAt: { gte: startDate, lte: endDate },
      },
      include: { category: true },
    }),
    prisma.accountsPayable.findMany({
      where: {
        companyId,
        status: 'pago',
        paidAt: { gte: startDate, lte: endDate },
      },
      include: { category: true },
    }),
  ]);

  const totalReceitas = receivables.reduce((s, r) => s + (r.amountReceived ?? r.amount), 0);
  const totalDespesas = payables.reduce((s, p) => s + (p.amountPaid ?? p.amount), 0);

  // Group by category
  const receitasByCategory: Record<string, { name: string; amount: number }> = {};
  for (const r of receivables) {
    const key = r.categoryId ?? '__sem_categoria';
    const name = r.category?.name ?? 'Sem Categoria';
    if (!receitasByCategory[key]) receitasByCategory[key] = { name, amount: 0 };
    receitasByCategory[key].amount += r.amountReceived ?? r.amount;
  }

  const despesasByCategory: Record<string, { name: string; amount: number }> = {};
  for (const p of payables) {
    const key = p.categoryId ?? '__sem_categoria';
    const name = p.category?.name ?? 'Sem Categoria';
    if (!despesasByCategory[key]) despesasByCategory[key] = { name, amount: 0 };
    despesasByCategory[key].amount += p.amountPaid ?? p.amount;
  }

  return {
    totalReceitas,
    totalDespesas,
    resultado: totalReceitas - totalDespesas,
    receitasByCategory,
    despesasByCategory,
  };
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const companyId = session.user.activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });

  const { searchParams } = new URL(req.url);

  // Period A
  const aFrom = searchParams.get('aFrom');
  const aTo = searchParams.get('aTo');
  // Period B
  const bFrom = searchParams.get('bFrom');
  const bTo = searchParams.get('bTo');

  if (!aFrom || !aTo || !bFrom || !bTo) {
    return NextResponse.json({ error: 'Parâmetros obrigatórios: aFrom, aTo, bFrom, bTo' }, { status: 400 });
  }

  const [periodA, periodB] = await Promise.all([
    getPeriodData(
      companyId,
      new Date(aFrom),
      new Date(aTo + 'T23:59:59')
    ),
    getPeriodData(
      companyId,
      new Date(bFrom),
      new Date(bTo + 'T23:59:59')
    ),
  ]);

  // Merge categories from both periods
  const allReceita = new Set([
    ...Object.keys(periodA.receitasByCategory),
    ...Object.keys(periodB.receitasByCategory),
  ]);
  const allDespesa = new Set([
    ...Object.keys(periodA.despesasByCategory),
    ...Object.keys(periodB.despesasByCategory),
  ]);

  const receitaComparison = [...allReceita].map((key) => ({
    categoryId: key === '__sem_categoria' ? null : key,
    name: periodA.receitasByCategory[key]?.name ?? periodB.receitasByCategory[key]?.name ?? 'Sem Categoria',
    amountA: periodA.receitasByCategory[key]?.amount ?? 0,
    amountB: periodB.receitasByCategory[key]?.amount ?? 0,
  })).sort((a, b) => (b.amountA + b.amountB) - (a.amountA + a.amountB));

  const despesaComparison = [...allDespesa].map((key) => ({
    categoryId: key === '__sem_categoria' ? null : key,
    name: periodA.despesasByCategory[key]?.name ?? periodB.despesasByCategory[key]?.name ?? 'Sem Categoria',
    amountA: periodA.despesasByCategory[key]?.amount ?? 0,
    amountB: periodB.despesasByCategory[key]?.amount ?? 0,
  })).sort((a, b) => (b.amountA + b.amountB) - (a.amountA + a.amountB));

  return NextResponse.json({
    periodA: { from: aFrom, to: aTo, ...periodA },
    periodB: { from: bFrom, to: bTo, ...periodB },
    receitaComparison,
    despesaComparison,
  });
}
