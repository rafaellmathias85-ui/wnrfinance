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
  const year = parseInt(searchParams.get('year') ?? String(new Date().getFullYear()));
  const month = parseInt(searchParams.get('month') ?? String(new Date().getMonth() + 1));

  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59);

  const [payables, receivables] = await Promise.all([
    prisma.accountsPayable.findMany({
      where: { companyId, dueDate: { gte: start, lte: end } },
      select: { id: true, description: true, amount: true, dueDate: true, status: true, category: { select: { name: true } } },
      orderBy: { dueDate: 'asc' },
    }),
    prisma.accountsReceivable.findMany({
      where: { companyId, dueDate: { gte: start, lte: end } },
      select: { id: true, description: true, amount: true, dueDate: true, status: true, category: { select: { name: true } } },
      orderBy: { dueDate: 'asc' },
    }),
  ]);

  const events = [
    ...payables.map(p => ({
      id: p.id,
      date: p.dueDate.toISOString().slice(0, 10),
      title: p.description,
      amount: p.amount,
      type: 'payable' as const,
      status: p.status,
      category: p.category?.name ?? null,
    })),
    ...receivables.map(r => ({
      id: r.id,
      date: r.dueDate.toISOString().slice(0, 10),
      title: r.description,
      amount: r.amount,
      type: 'receivable' as const,
      status: r.status,
      category: r.category?.name ?? null,
    })),
  ];

  return NextResponse.json(events);
}
