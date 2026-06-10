import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const companyId = (session.user as any).activeCompanyId;
    if (!companyId) return NextResponse.json({ customers: [], summary: { total: 0, count: 0 } });

    const url = new URL(req.url);
    const minRating = url.searchParams.get('minRating');

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const overdue = await prisma.accountsReceivable.findMany({
      where: {
        companyId,
        dueDate: { lt: today },
        status: { notIn: ['recebido', 'cancelado'] },
      },
      orderBy: { dueDate: 'asc' },
    });

    const negotiations = await prisma.receivableNegotiation.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    });

    // Lookup clients by name for rating info
    const clientNames = [...new Set(overdue.map((r: any) => r.customerName).filter(Boolean))];
    const clients = await prisma.client.findMany({
      where: { companyId, name: { in: clientNames as string[] } },
      select: { id: true, name: true, rating: true, phone: true, email: true },
    });
    const clientByName = Object.fromEntries(clients.map((c: any) => [c.name, c]));

    const byCustomer: Record<string, any> = {};
    overdue.forEach((r: any) => {
      const key = r.customerName || 'Cliente não informado';
      if (!byCustomer[key]) {
        const client = clientByName[key];
        byCustomer[key] = {
          customerName: key,
          clientId: client?.id || null,
          clientRating: client?.rating || null,
          clientPhone: client?.phone || null,
          clientEmail: client?.email || null,
          receivables: [],
          totalOverdue: 0,
          oldestDueDate: null as Date | null,
          lastPaymentDate: null as Date | null,
          forecastDate: null as Date | null,
          negotiationCount: 0,
          lostCount: 0,
          notNegotiatedCount: 0,
          nextContact: null as Date | null,
        };
      }
      const group = byCustomer[key];
      group.receivables.push(r);
      const pending = (r.amount || 0) - (r.amountReceived || 0);
      group.totalOverdue += Math.max(0, pending);
      if (!group.oldestDueDate || r.dueDate < group.oldestDueDate) group.oldestDueDate = r.dueDate;
    });

    negotiations.forEach((n: any) => {
      const key = n.customerName || '';
      if (byCustomer[key]) {
        if (n.status === 'negociado' || n.status === 'pago') byCustomer[key].negotiationCount += 1;
        if (n.status === 'perdido') byCustomer[key].lostCount += 1;
        if (n.status === 'cancelado') byCustomer[key].notNegotiatedCount += 1;
        if (n.nextContact && (!byCustomer[key].nextContact || n.nextContact > byCustomer[key].nextContact)) {
          byCustomer[key].nextContact = n.nextContact;
        }
      }
    });

    let customers = Object.values(byCustomer).sort((a: any, b: any) => b.totalOverdue - a.totalOverdue);

    // Rating filter
    if (minRating) {
      const min = parseInt(minRating);
      customers = customers.filter((c: any) => c.clientRating == null || c.clientRating >= min);
    }

    const summary = {
      total: customers.reduce((s: number, c: any) => s + c.totalOverdue, 0),
      count: customers.length,
      receivablesCount: overdue.length,
    };

    return NextResponse.json({ customers, summary });
  } catch (error) {
    console.error('Error fetching delinquency:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
