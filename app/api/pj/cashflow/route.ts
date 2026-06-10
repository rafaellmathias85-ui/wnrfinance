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

  const url = new URL(req.url);
  const days = parseInt(url.searchParams.get('days') || '90');

  const now = new Date();
  const endDate = new Date(now);
  endDate.setDate(endDate.getDate() + days);

  const [payables, receivables] = await Promise.all([
    prisma.accountsPayable.findMany({
      where: { companyId, dueDate: { gte: now, lte: endDate }, status: { in: ['pendente', 'vencido'] } },
      select: { amount: true, dueDate: true },
      orderBy: { dueDate: 'asc' },
    }),
    prisma.accountsReceivable.findMany({
      where: { companyId, dueDate: { gte: now, lte: endDate }, status: { in: ['pendente', 'vencido'] } },
      select: { amount: true, dueDate: true },
      orderBy: { dueDate: 'asc' },
    }),
  ]);

  // Group by week
  const weeks: any[] = [];
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  let current = new Date(now);

  while (current < endDate) {
    const weekEnd = new Date(current.getTime() + weekMs);
    const weekPayables = payables
      .filter(p => new Date(p.dueDate) >= current && new Date(p.dueDate) < weekEnd)
      .reduce((sum, p) => sum + Number(p.amount), 0);
    const weekReceivables = receivables
      .filter(r => new Date(r.dueDate) >= current && new Date(r.dueDate) < weekEnd)
      .reduce((sum, r) => sum + Number(r.amount), 0);

    weeks.push({
      start: current.toISOString().split('T')[0],
      end: new Date(weekEnd.getTime() - 1).toISOString().split('T')[0],
      payables: weekPayables,
      receivables: weekReceivables,
      net: weekReceivables - weekPayables,
    });
    current = weekEnd;
  }

  // Cumulative balance
  let cumulative = 0;
  weeks.forEach(w => {
    cumulative += w.net;
    w.cumulative = cumulative;
  });

  return NextResponse.json({
    summary: {
      totalPayables: payables.reduce((s, p) => s + Number(p.amount), 0),
      totalReceivables: receivables.reduce((s, r) => s + Number(r.amount), 0),
      netProjection: receivables.reduce((s, r) => s + Number(r.amount), 0) - payables.reduce((s, p) => s + Number(p.amount), 0),
    },
    weeks,
  });
}
