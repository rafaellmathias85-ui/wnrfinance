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
    totalProdutos,
    produtos,
    entradasMes,
    saidasMes,
    recentMovements,
  ] = await Promise.all([
    prisma.product.count({ where: { companyId, status: 'ativo' } }),
    prisma.product.findMany({
      where: { companyId, status: 'ativo' },
      select: { id: true, name: true, currentStock: true, minStock: true, costPrice: true, salePrice: true, code: true },
    }),
    prisma.stockMovement.aggregate({
      _sum: { quantity: true, totalCost: true },
      _count: { _all: true },
      where: { companyId, type: 'entrada', createdAt: { gte: monthStart } },
    }),
    prisma.stockMovement.aggregate({
      _sum: { quantity: true, totalCost: true },
      _count: { _all: true },
      where: { companyId, type: 'saida', createdAt: { gte: monthStart } },
    }),
    prisma.stockMovement.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: 8,
      include: { product: { select: { name: true, code: true } } },
    }),
  ]);

  const estoqueBaixo = produtos.filter(p => p.currentStock <= p.minStock);
  const valorEstoque = produtos.reduce((sum, p) => sum + (p.currentStock * (p.costPrice ?? 0)), 0);

  return NextResponse.json({
    totalProdutos,
    valorEstoque,
    estoqueBaixo: estoqueBaixo.length,
    estoqueBaixoItems: estoqueBaixo.slice(0, 5).map(p => ({
      id: p.id,
      name: p.name,
      code: p.code,
      currentStock: p.currentStock,
      minStock: p.minStock,
    })),
    entradasMes: {
      count: entradasMes._count._all,
      quantity: entradasMes._sum.quantity ?? 0,
      value: entradasMes._sum.totalCost ?? 0,
    },
    saidasMes: {
      count: saidasMes._count._all,
      quantity: saidasMes._sum.quantity ?? 0,
      value: saidasMes._sum.totalCost ?? 0,
    },
    recentMovements: recentMovements.map(m => ({
      id: m.id,
      type: m.type,
      quantity: m.quantity,
      totalCost: m.totalCost,
      productName: m.product?.name ?? '—',
      productCode: m.product?.code ?? '',
      createdAt: m.createdAt,
    })),
  });
}
