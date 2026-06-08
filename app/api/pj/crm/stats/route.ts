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

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    totalLeads,
    novosLeadsMes,
    oportunidadesAbertas,
    conquistasMes,
    perdasMes,
    valorPipeline,
    atividadesPendentes,
    recentActivities,
    funnelDistribution,
  ] = await Promise.all([
    prisma.cRMLead.count({ where: { companyId } }),
    prisma.cRMLead.count({ where: { companyId, createdAt: { gte: monthStart } } }),
    prisma.cRMOpportunity.count({ where: { companyId, status: { notIn: ['ganho', 'perdido'] } } }),
    prisma.cRMOpportunity.count({ where: { companyId, status: 'ganho', closedAt: { gte: monthStart } } }),
    prisma.cRMOpportunity.count({ where: { companyId, status: 'perdido', closedAt: { gte: monthStart } } }),
    prisma.cRMOpportunity.aggregate({
      _sum: { value: true },
      where: { companyId, status: { notIn: ['ganho', 'perdido'] } },
    }),
    prisma.cRMActivity.count({
      where: { companyId, completed: false, dueDate: { lte: now } },
    }),
    prisma.cRMActivity.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: { id: true, type: true, title: true, completed: true, dueDate: true, createdAt: true },
    }),
    prisma.cRMOpportunity.groupBy({
      by: ['funnelId'],
      _count: { _all: true },
      _sum: { value: true },
      where: { companyId, status: { notIn: ['ganho', 'perdido'] } },
    }),
  ]);

  const totalGanhoMes = await prisma.cRMOpportunity.aggregate({
    _sum: { value: true },
    where: { companyId, status: 'ganho', closedAt: { gte: monthStart } },
  });

  const taxaConversao = (totalLeads + oportunidadesAbertas) > 0
    ? (conquistasMes / Math.max(totalLeads, 1)) * 100
    : 0;

  return NextResponse.json({
    totalLeads,
    novosLeadsMes,
    oportunidadesAbertas,
    conquistasMes,
    perdasMes,
    valorPipeline: valorPipeline._sum.value ?? 0,
    valorGanhoMes: totalGanhoMes._sum.value ?? 0,
    atividadesPendentes,
    taxaConversao: Math.round(taxaConversao * 10) / 10,
    recentActivities,
    funnelDistribution: funnelDistribution.map(f => ({
      funnelId: f.funnelId,
      count: f._count._all,
      value: f._sum.value ?? 0,
    })),
  });
}
