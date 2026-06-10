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
  const type = searchParams.get('type') ?? 'receivable'; // receivable | payable

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const BUCKETS = [
    { label: 'A vencer', min: 1, max: Infinity, future: true },
    { label: 'Hoje', min: 0, max: 0, future: false },
    { label: '1-30 dias', min: 1, max: 30, future: false },
    { label: '31-60 dias', min: 31, max: 60, future: false },
    { label: '61-90 dias', min: 61, max: 90, future: false },
    { label: '91-120 dias', min: 91, max: 120, future: false },
    { label: '+120 dias', min: 121, max: Infinity, future: false },
  ];

  if (type === 'receivable') {
    const items = await prisma.accountsReceivable.findMany({
      where: { companyId, status: { notIn: ['recebido', 'cancelado'] } },
      select: {
        id: true, description: true, customerName: true,
        amount: true, dueDate: true, category: { select: { name: true } },
      },
      orderBy: { dueDate: 'asc' },
    });

    const withDays = items.map(item => {
      const due = new Date(item.dueDate);
      due.setHours(0, 0, 0, 0);
      const diffMs = today.getTime() - due.getTime();
      const daysOverdue = Math.floor(diffMs / 86400000);
      return { ...item, daysOverdue };
    });

    const buckets = BUCKETS.map(b => ({
      label: b.label,
      items: withDays.filter(i => {
        if (b.future) return i.daysOverdue < 0;
        if (b.min === 0 && b.max === 0) return i.daysOverdue === 0;
        return i.daysOverdue >= b.min && i.daysOverdue <= b.max;
      }),
    })).map(b => ({
      label: b.label,
      count: b.items.length,
      total: b.items.reduce((s, i) => s + i.amount, 0),
      items: b.items,
    }));

    return NextResponse.json({ type: 'receivable', buckets });
  } else {
    const items = await prisma.accountsPayable.findMany({
      where: { companyId, status: { notIn: ['pago', 'cancelado'] } },
      select: {
        id: true, description: true, supplierName: true,
        amount: true, dueDate: true, category: { select: { name: true } },
      },
      orderBy: { dueDate: 'asc' },
    });

    const withDays = items.map(item => {
      const due = new Date(item.dueDate);
      due.setHours(0, 0, 0, 0);
      const diffMs = today.getTime() - due.getTime();
      const daysOverdue = Math.floor(diffMs / 86400000);
      return { ...item, daysOverdue };
    });

    const buckets = BUCKETS.map(b => ({
      label: b.label,
      items: withDays.filter(i => {
        if (b.future) return i.daysOverdue < 0;
        if (b.min === 0 && b.max === 0) return i.daysOverdue === 0;
        return i.daysOverdue >= b.min && i.daysOverdue <= b.max;
      }),
    })).map(b => ({
      label: b.label,
      count: b.items.length,
      total: b.items.reduce((s, i) => s + i.amount, 0),
      items: b.items,
    }));

    return NextResponse.json({ type: 'payable', buckets });
  }
}
