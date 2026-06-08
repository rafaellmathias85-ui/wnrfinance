import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET: list overdue receivables grouped by customer with negotiation counts
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const companyId = session.user.activeCompanyId;
    if (!companyId) return NextResponse.json({ customers: [], summary: { total: 0, count: 0 } });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Find all overdue receivables (due date < today AND status != recebido/cancelado)
    const overdue = await prisma.accountsReceivable.findMany({
      where: {
        companyId,
        dueDate: { lt: today },
        status: { notIn: ['recebido', 'cancelado'] },
      },
      orderBy: { dueDate: 'asc' },
    });

    // Also fetch all negotiations for this company
    const negotiations = await prisma.receivableNegotiation.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    });

    // Group receivables by customer name
    const byCustomer: Record<string, any> = {};
    overdue.forEach((r: any) => {
      const key = r.customerName || 'Cliente não informado';
      if (!byCustomer[key]) {
        byCustomer[key] = {
          customerName: key,
          receivables: [],
          totalOverdue: 0,
          oldestDueDate: null as Date | null,
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

    // Add negotiation stats to each customer
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

    const customers = Object.values(byCustomer).sort((a: any, b: any) => b.totalOverdue - a.totalOverdue);
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
