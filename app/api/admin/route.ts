import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { role: true } });
  if (!user || !['admin', 'master'].includes(user.role)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const [
    totalUsers, activeUsers30d, newUsersThisMonth, newUsersLastMonth,
    totalExpenses, totalIncomes, subscriptions,
    recentUsers, reconciliationStats,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { updatedAt: { gte: thirtyDaysAgo } } }),
    prisma.user.count({ where: { createdAt: { gte: monthStart } } }),
    prisma.user.count({ where: { createdAt: { gte: lastMonthStart, lt: monthStart } } }),
    prisma.expense.aggregate({ _sum: { amount: true } }),
    prisma.income.aggregate({ _sum: { amount: true } }),
    prisma.subscription.groupBy({ by: ['plan', 'status'], _count: true }),
    prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true, name: true, email: true, createdAt: true, role: true,
        subscription: { select: { plan: true, status: true, trialEndsAt: true } },
        _count: { select: { expenses: true, incomes: true, bankConnections: true } },
      },
    }),
    prisma.reconciliation.groupBy({ by: ['status'], _count: true }),
  ]);

  // MRR calculation
  const activeSubs = await prisma.subscription.findMany({
    where: { status: 'active', plan: { not: 'free' } },
    select: { plan: true },
  });
  const planPrices: Record<string, number> = { pro: 19.90, premium: 49.90 };
  const mrr = activeSubs.reduce((sum: number, s: any) => sum + (planPrices[s.plan] || 0), 0);

  // Churn: canceled in last 30 days
  const churnedCount = await prisma.subscription.count({
    where: { canceledAt: { gte: thirtyDaysAgo } },
  });
  const churnRate = totalUsers > 0 ? (churnedCount / totalUsers) * 100 : 0;

  // Conversion: paid / total
  const paidCount = activeSubs.length;
  const conversionRate = totalUsers > 0 ? (paidCount / totalUsers) * 100 : 0;

  // Usage stats
  const [totalBankTx, totalReconciled, avgExpensesPerUser] = await Promise.all([
    prisma.bankTransaction.count(),
    prisma.reconciliation.count({ where: { status: 'RECONCILED' } }),
    prisma.expense.groupBy({ by: ['userId'], _count: true }).then((g: any[]) => {
      if (g.length === 0) return 0;
      return g.reduce((s: number, i: any) => s + i._count, 0) / g.length;
    }),
  ]);

  // Monthly growth data (last 6 months)
  const monthlyGrowth = [];
  for (let i = 5; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const count = await prisma.user.count({ where: { createdAt: { gte: start, lt: end } } });
    monthlyGrowth.push({
      month: start.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
      users: count,
    });
  }

  return NextResponse.json({
    totalUsers,
    activeUsers30d,
    newUsersThisMonth,
    newUsersLastMonth,
    totalExpenses: totalExpenses._sum.amount || 0,
    totalIncomes: totalIncomes._sum.amount || 0,
    mrr,
    churnRate: Math.round(churnRate * 100) / 100,
    conversionRate: Math.round(conversionRate * 100) / 100,
    paidCount,
    churnedCount,
    subscriptions,
    recentUsers,
    reconciliationStats,
    totalBankTx,
    totalReconciled,
    avgExpensesPerUser: Math.round(avgExpensesPerUser),
    monthlyGrowth,
  });
}
