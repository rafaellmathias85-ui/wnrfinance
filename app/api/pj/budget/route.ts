export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const companyId = session.user.activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const year = searchParams.get('year') || String(new Date().getFullYear());
  const month = searchParams.get('month');
  const type = searchParams.get('type');

  const where: any = { companyId };
  if (month) {
    where.period = `${year}-${month.padStart(2, '0')}`;
  } else {
    where.period = { startsWith: year };
  }
  if (type) where.type = type;

  const budgets = await prisma.budgetForecast.findMany({
    where,
    include: { category: true },
    orderBy: [{ period: 'asc' }, { type: 'asc' }],
  });

  // Also fetch actuals for the same period to compute variance
  const periods = [...new Set(budgets.map((b) => b.period))];
  const actuals: Record<string, { receita: number; despesa: number }> = {};

  await Promise.all(
    periods.map(async (period) => {
      const [y, m] = period.split('-');
      const start = new Date(Number(y), Number(m) - 1, 1);
      const end = new Date(Number(y), Number(m), 0, 23, 59, 59);

      const [receivables, payables] = await Promise.all([
        prisma.accountsReceivable.aggregate({
          where: { companyId, status: 'recebido', receivedAt: { gte: start, lte: end } },
          _sum: { amountReceived: true, amount: true },
        }),
        prisma.accountsPayable.aggregate({
          where: { companyId, status: 'pago', paidAt: { gte: start, lte: end } },
          _sum: { amountPaid: true, amount: true },
        }),
      ]);

      actuals[period] = {
        receita: receivables._sum.amountReceived ?? receivables._sum.amount ?? 0,
        despesa: payables._sum.amountPaid ?? payables._sum.amount ?? 0,
      };
    })
  );

  const result = budgets.map((b) => ({
    ...b,
    actualAmount: actuals[b.period]?.[b.type as 'receita' | 'despesa'] ?? 0,
    variance: (actuals[b.period]?.[b.type as 'receita' | 'despesa'] ?? 0) - b.plannedAmount,
  }));

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const companyId = session.user.activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });

  const body = await req.json();
  if (!body.period || !body.type || body.plannedAmount === undefined) {
    return NextResponse.json({ error: 'Campos obrigatórios: period, type, plannedAmount' }, { status: 400 });
  }

  const budget = await prisma.budgetForecast.upsert({
    where: {
      companyId_categoryId_period_type: {
        companyId,
        categoryId: body.categoryId || null,
        period: body.period,
        type: body.type,
      },
    },
    update: { plannedAmount: parseFloat(body.plannedAmount), notes: body.notes ?? null },
    create: {
      companyId,
      categoryId: body.categoryId || null,
      type: body.type,
      period: body.period,
      plannedAmount: parseFloat(body.plannedAmount),
      notes: body.notes ?? null,
    },
  });

  return NextResponse.json(budget, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const companyId = session.user.activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });

  const existing = await prisma.budgetForecast.findFirst({ where: { id, companyId } });
  if (!existing) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

  await prisma.budgetForecast.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
