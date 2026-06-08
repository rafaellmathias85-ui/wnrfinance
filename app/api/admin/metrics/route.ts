export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET /api/admin/metrics — SaaS metrics (admin only)
export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const isAdmin = ['master', 'admin'].includes(session.user.role ?? '');
    if (!isAdmin) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || '30'; // days

    const since = new Date();
    since.setDate(since.getDate() - parseInt(period));

    const [
      totalUsers,
      newUsers,
      activeUsers,
      totalCompanies,
      newCompanies,
      subscriptions,
      totalExpenses,
      totalNFes,
      totalBoletos,
      recentAuditActions,
    ] = await Promise.all([
      // Users
      prisma.user.count(),
      prisma.user.count({ where: { createdAt: { gte: since } } }),
      prisma.user.count({ where: { updatedAt: { gte: since } } }),
      // Companies
      prisma.company.count(),
      prisma.company.count({ where: { createdAt: { gte: since } } }),
      // Subscriptions by plan
      prisma.subscription.groupBy({ by: ['plan'], _count: { plan: true } }),
      // Financial activity
      prisma.expense.count({ where: { createdAt: { gte: since } } }),
      prisma.nFe.count({ where: { createdAt: { gte: since } } }),
      prisma.boletoCharge.count({ where: { createdAt: { gte: since } } }),
      // Audit activity
      prisma.auditLog.groupBy({
        by: ['action'],
        _count: { action: true },
        where: { createdAt: { gte: since } },
        orderBy: { _count: { action: 'desc' } },
      }),
    ]);

    // Plan breakdown
    const planMap: Record<string, number> = {};
    for (const s of subscriptions) planMap[s.plan] = s._count.plan;

    // MRR estimate (very simplified)
    const proCount = planMap['pro'] || 0;
    const premiumCount = planMap['premium'] || 0;
    const mrr = proCount * 19.90 + premiumCount * 49.90;

    // Users by plan
    const usersByPlan = {
      free: (planMap['free'] || 0) + (totalUsers - Object.values(planMap).reduce((a, b) => a + b, 0)),
      pro: proCount,
      premium: premiumCount,
    };

    // Churn approximation: users who canceled or downgraded
    const churned = await prisma.subscription.count({
      where: { status: 'canceled', updatedAt: { gte: since } },
    });

    // Top user by activity
    const topUsers = await prisma.auditLog.groupBy({
      by: ['userId'],
      _count: { userId: true },
      where: { createdAt: { gte: since } },
      orderBy: { _count: { userId: 'desc' } },
      take: 5,
    });

    // Active companies (with recent payables/receivables)
    const activeCompanies = await prisma.company.count({
      where: {
        OR: [
          { payables: { some: { createdAt: { gte: since } } } },
          { receivables: { some: { createdAt: { gte: since } } } },
        ],
      },
    });

    // Daily new users (last 7 days)
    const dailyUsers = await prisma.$queryRaw<{ day: Date; count: number }[]>`
      SELECT DATE(created_at) as day, COUNT(*) as count
      FROM "User"
      WHERE created_at >= NOW() - INTERVAL '7 days'
      GROUP BY DATE(created_at)
      ORDER BY day DESC
    `.catch(() => []);

    return NextResponse.json({
      period: parseInt(period),
      users: {
        total: totalUsers,
        new: newUsers,
        active: activeUsers,
        byPlan: usersByPlan,
      },
      companies: {
        total: totalCompanies,
        new: newCompanies,
        active: activeCompanies,
      },
      revenue: {
        mrr,
        arr: mrr * 12,
        proUsers: proCount,
        premiumUsers: premiumCount,
      },
      churn: {
        canceled: churned,
        rate: totalUsers > 0 ? ((churned / totalUsers) * 100).toFixed(2) : '0',
      },
      activity: {
        expenses: totalExpenses,
        nfes: totalNFes,
        boletos: totalBoletos,
        auditActions: recentAuditActions.map((a) => ({ action: a.action, count: a._count.action })),
      },
      topUsers,
      dailyUsers,
    });
  } catch (error: any) {
    console.error('Admin metrics error:', error);
    return NextResponse.json({ error: 'Erro ao buscar métricas' }, { status: 500 });
  }
}
