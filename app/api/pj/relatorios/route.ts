export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const companyId = session.user.activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });

  const months = parseInt(req.nextUrl.searchParams.get('months') || '6');

  // Build monthly date ranges
  const now = new Date();
  const monthlyData = [];

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
    const label = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });

    const [receitas, despesas, nfes] = await Promise.all([
      prisma.accountsReceivable.aggregate({
        _sum: { amount: true },
        where: { companyId, dueDate: { gte: start, lte: end } },
      }),
      prisma.accountsPayable.aggregate({
        _sum: { amount: true },
        where: { companyId, dueDate: { gte: start, lte: end } },
      }),
      prisma.nFe.count({
        where: { companyId, status: 'autorizada', issuedAt: { gte: start, lte: end } },
      }),
    ]);

    const rec = receitas._sum.amount ?? 0;
    const desp = despesas._sum.amount ?? 0;
    monthlyData.push({
      label,
      month: d.getMonth() + 1,
      year: d.getFullYear(),
      receitas: rec,
      despesas: desp,
      lucro: rec - desp,
      nfes,
    });
  }

  // Current month totals
  const currentStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const currentEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const [
    totalReceitas,
    totalDespesas,
    receitasByCategory,
    despesasByCategory,
    topClients,
    topPayables,
    nfesTotal,
    boletosTotal,
    pendingReceivables,
    overduePayables,
  ] = await Promise.all([
    // Current month totals
    prisma.accountsReceivable.aggregate({
      _sum: { amount: true },
      where: { companyId, dueDate: { gte: currentStart, lte: currentEnd } },
    }),
    prisma.accountsPayable.aggregate({
      _sum: { amount: true },
      where: { companyId, dueDate: { gte: currentStart, lte: currentEnd } },
    }),
    // Revenue by category
    prisma.accountsReceivable.groupBy({
      by: ['categoryId'],
      _sum: { amount: true },
      _count: { id: true },
      where: { companyId, dueDate: { gte: currentStart } },
      orderBy: { _sum: { amount: 'desc' } },
      take: 8,
    }),
    // Expenses by category
    prisma.accountsPayable.groupBy({
      by: ['categoryId'],
      _sum: { amount: true },
      _count: { id: true },
      where: { companyId, dueDate: { gte: currentStart } },
      orderBy: { _sum: { amount: 'desc' } },
      take: 8,
    }),
    // Top clients by revenue (12 months)
    prisma.accountsReceivable.groupBy({
      by: ['customerName'],
      _sum: { amount: true },
      _count: { id: true },
      where: { companyId, customerName: { not: null }, dueDate: { gte: new Date(now.getFullYear(), now.getMonth() - 11, 1) } },
      orderBy: { _sum: { amount: 'desc' } },
      take: 5,
    }),
    // Top suppliers by spend (12 months)
    prisma.accountsPayable.groupBy({
      by: ['supplierName'],
      _sum: { amount: true },
      _count: { _all: true },
      where: { companyId, supplierName: { not: null }, dueDate: { gte: new Date(now.getFullYear(), now.getMonth() - 11, 1) } },
      orderBy: { _sum: { amount: 'desc' } },
      take: 5,
    }),
    // NF-e this month
    prisma.nFe.aggregate({
      _count: { _all: true },
      where: { companyId, status: 'autorizada', issuedAt: { gte: currentStart, lte: currentEnd } },
    }),
    // Boleto/PIX this month
    prisma.boletoCharge.aggregate({
      _sum: { amount: true },
      _count: { _all: true },
      where: { companyId, status: 'pago', createdAt: { gte: currentStart, lte: currentEnd } },
    }),
    // Pending receivables
    prisma.accountsReceivable.aggregate({
      _sum: { amount: true },
      _count: { _all: true },
      where: { companyId, status: 'pendente' },
    }),
    // Overdue payables
    prisma.accountsPayable.aggregate({
      _sum: { amount: true },
      _count: { _all: true },
      where: { companyId, status: 'pendente', dueDate: { lt: now } },
    }),
  ]);

  return NextResponse.json({
    monthlyEvolution: monthlyData,
    currentMonth: {
      receitas: totalReceitas._sum.amount ?? 0,
      despesas: totalDespesas._sum.amount ?? 0,
      lucro: (totalReceitas._sum.amount ?? 0) - (totalDespesas._sum.amount ?? 0),
      nfes: nfesTotal._count._all,
      boletosRecebidos: boletosTotal._count._all,
      boletosValor: boletosTotal._sum.amount ?? 0,
    },
    receitasByCategory: receitasByCategory.map(r => ({
      category: r.categoryId || 'Sem categoria',
      total: r._sum?.amount ?? 0,
      count: r._count?.id ?? 0,
    })),
    despesasByCategory: despesasByCategory.map(d => ({
      category: d.categoryId || 'Sem categoria',
      total: d._sum?.amount ?? 0,
      count: d._count?.id ?? 0,
    })),
    topClients: topClients.map(c => ({
      name: c.customerName,
      total: c._sum?.amount ?? 0,
      count: c._count?.id ?? 0,
    })),
    topSuppliers: topPayables.map(s => ({
      name: s.supplierName,
      total: s._sum.amount ?? 0,
      count: s._count._all,
    })),
    pendingReceivables: {
      total: pendingReceivables._sum.amount ?? 0,
      count: pendingReceivables._count._all,
    },
    overduePayables: {
      total: overduePayables._sum.amount ?? 0,
      count: overduePayables._count._all,
    },
  });
}
