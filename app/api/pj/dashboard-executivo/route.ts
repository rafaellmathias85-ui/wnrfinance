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

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
  const yearStart = new Date(now.getFullYear(), 0, 1);

  const [
    receivedCurr, receivedPrev,
    paidCurr, paidPrev,
    pendingReceivable, overdueReceivable,
    pendingPayable, overduePayable,
    clientsTotal, clientsNew,
    nfeCount, nfeCountPrev,
    goalsTotal, goalsAchieved,
    rawReceivedByMonth,
    rawPaidByMonth,
  ] = await Promise.all([
    // Revenue received this month
    prisma.accountsReceivable.aggregate({
      where: { companyId, status: 'recebido', receivedAt: { gte: monthStart, lte: monthEnd } },
      _sum: { amount: true },
    }),
    // Revenue received prev month
    prisma.accountsReceivable.aggregate({
      where: { companyId, status: 'recebido', receivedAt: { gte: prevMonthStart, lte: prevMonthEnd } },
      _sum: { amount: true },
    }),
    // Paid this month
    prisma.accountsPayable.aggregate({
      where: { companyId, status: 'pago', paidAt: { gte: monthStart, lte: monthEnd } },
      _sum: { amount: true },
    }),
    // Paid prev month
    prisma.accountsPayable.aggregate({
      where: { companyId, status: 'pago', paidAt: { gte: prevMonthStart, lte: prevMonthEnd } },
      _sum: { amount: true },
    }),
    // Pending receivables
    prisma.accountsReceivable.aggregate({
      where: { companyId, status: { notIn: ['recebido', 'cancelado'] } },
      _sum: { amount: true }, _count: true,
    }),
    // Overdue receivables
    prisma.accountsReceivable.aggregate({
      where: { companyId, status: { notIn: ['recebido', 'cancelado'] }, dueDate: { lt: now } },
      _sum: { amount: true }, _count: true,
    }),
    // Pending payables
    prisma.accountsPayable.aggregate({
      where: { companyId, status: { notIn: ['pago', 'cancelado'] } },
      _sum: { amount: true }, _count: true,
    }),
    // Overdue payables
    prisma.accountsPayable.aggregate({
      where: { companyId, status: { notIn: ['pago', 'cancelado'] }, dueDate: { lt: now } },
      _sum: { amount: true }, _count: true,
    }),
    // Total active clients
    prisma.client.count({ where: { companyId, isActive: true } }),
    // New clients this month
    prisma.client.count({ where: { companyId, createdAt: { gte: monthStart } } }),
    // NF-e this month
    prisma.nFe.count({ where: { companyId, status: 'autorizada', issuedAt: { gte: monthStart, lte: monthEnd } } }),
    // NF-e prev month
    prisma.nFe.count({ where: { companyId, status: 'autorizada', issuedAt: { gte: prevMonthStart, lte: prevMonthEnd } } }),
    // Goals this month
    prisma.goal.count({ where: { companyId, period: now.toISOString().slice(0, 7) } }),
    // Goals achieved this month
    prisma.goal.count({ where: { companyId, period: now.toISOString().slice(0, 7), status: 'atingida' } }),
    // Monthly receivables for chart (last 6 months) — fetched in app to avoid raw SQL column casing issues
    prisma.accountsReceivable.findMany({
      where: { companyId, status: 'recebido', receivedAt: { gte: new Date(now.getFullYear(), now.getMonth() - 5, 1) } },
      select: { receivedAt: true, amount: true },
    }),
    // Monthly payments for chart (last 6 months)
    prisma.accountsPayable.findMany({
      where: { companyId, status: 'pago', paidAt: { gte: new Date(now.getFullYear(), now.getMonth() - 5, 1) } },
      select: { paidAt: true, amount: true },
    }),
  ]);

  // Aggregate chart data by month in application
  const groupByMonth = (rows: { date: Date | null; amount: number }[]) => {
    const acc: Record<string, number> = {};
    rows.forEach(r => {
      if (!r.date) return;
      const m = r.date.toISOString().slice(0, 7);
      acc[m] = (acc[m] ?? 0) + r.amount;
    });
    return Object.entries(acc).sort(([a], [b]) => a.localeCompare(b)).map(([month, total]) => ({ month, total }));
  };

  const receivedByMonth = groupByMonth(rawReceivedByMonth.map(r => ({ date: r.receivedAt, amount: r.amount })));
  const paidByMonth = groupByMonth(rawPaidByMonth.map(r => ({ date: r.paidAt, amount: r.amount })));

  const revenueCurr = receivedCurr._sum.amount ?? 0;
  const revenuePrev = receivedPrev._sum.amount ?? 0;
  const expensesCurr = paidCurr._sum.amount ?? 0;
  const expensesPrev = paidPrev._sum.amount ?? 0;

  const pct = (curr: number, prev: number) =>
    prev === 0 ? null : Math.round(((curr - prev) / prev) * 100);

  return NextResponse.json({
    revenue: {
      current: revenueCurr,
      previous: revenuePrev,
      change: pct(revenueCurr, revenuePrev),
    },
    expenses: {
      current: expensesCurr,
      previous: expensesPrev,
      change: pct(expensesCurr, expensesPrev),
    },
    profit: {
      current: revenueCurr - expensesCurr,
      previous: revenuePrev - expensesPrev,
    },
    receivables: {
      pending: pendingReceivable._sum.amount ?? 0,
      pendingCount: pendingReceivable._count,
      overdue: overdueReceivable._sum.amount ?? 0,
      overdueCount: overdueReceivable._count,
    },
    payables: {
      pending: pendingPayable._sum.amount ?? 0,
      pendingCount: pendingPayable._count,
      overdue: overduePayable._sum.amount ?? 0,
      overdueCount: overduePayable._count,
    },
    clients: { total: clientsTotal, newThisMonth: clientsNew },
    nfe: { thisMonth: nfeCount, prevMonth: nfeCountPrev, change: pct(nfeCount, nfeCountPrev) },
    goals: { total: goalsTotal, achieved: goalsAchieved, rate: goalsTotal > 0 ? Math.round((goalsAchieved / goalsTotal) * 100) : 0 },
    charts: { receivedByMonth, paidByMonth },
  });
}
