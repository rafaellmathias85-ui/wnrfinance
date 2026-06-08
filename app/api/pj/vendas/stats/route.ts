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
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

  const [
    vendasMes,
    vendasMesAnterior,
    orcamentos,
    ordensServico,
    recentOrders,
    topSellers,
  ] = await Promise.all([
    prisma.salesOrder.aggregate({
      _sum: { total: true },
      _count: { _all: true },
      where: { companyId, type: 'venda', createdAt: { gte: monthStart } },
    }),
    prisma.salesOrder.aggregate({
      _sum: { total: true },
      where: { companyId, type: 'venda', createdAt: { gte: prevMonthStart, lte: prevMonthEnd } },
    }),
    prisma.salesOrder.count({
      where: { companyId, type: 'orcamento' },
    }),
    prisma.salesOrder.count({
      where: { companyId, type: 'ordem_servico' },
    }),
    prisma.salesOrder.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: { id: true, type: true, total: true, status: true, customerName: true, sellerName: true, createdAt: true },
    }),
    prisma.salesOrder.groupBy({
      by: ['sellerName'],
      _sum: { total: true },
      _count: { _all: true },
      where: { companyId, type: 'venda', sellerName: { not: null } },
      orderBy: { _sum: { total: 'desc' } },
      take: 5,
    }),
  ]);

  const totalMes = vendasMes._sum.total ?? 0;
  const totalMesAnterior = vendasMesAnterior._sum.total ?? 0;
  const variacaoMes = totalMesAnterior > 0 ? ((totalMes - totalMesAnterior) / totalMesAnterior) * 100 : null;
  const ticketMedio = vendasMes._count._all > 0 ? totalMes / vendasMes._count._all : 0;

  return NextResponse.json({
    vendasMes: totalMes,
    vendasCount: vendasMes._count._all,
    variacaoMes,
    ticketMedio,
    orcamentos,
    ordensServico,
    recentOrders,
    topSellers: topSellers.map(s => ({
      name: s.sellerName,
      total: s._sum.total ?? 0,
      count: s._count._all,
    })),
  });
}
