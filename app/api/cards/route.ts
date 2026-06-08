import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const bankId = searchParams.get('bankId');

    const isPJ = session.user.defaultEnv === 'pj';
    const companyId = session.user.activeCompanyId;

    const where: any = isPJ
      ? (companyId ? { companyId, scope: 'PJ' } : { id: '__none__' })
      : { userId: session.user.id, scope: 'PF' };

    if (bankId && bankId !== 'todos') {
      where.bankConnectionId = bankId === 'sem_banco' ? null : bankId;
    }

    const cards = await prisma.creditCard.findMany({
      where,
      include: {
        transactions: { orderBy: { date: 'desc' }, take: 200 },
        bankConnection: { select: { id: true, bankName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const now = new Date();
    const cardsWithInvoice = cards.map((card: any) => {
      // Calcula fatura baseada no ciclo de fechamento do cartão
      const closingDay = card.closingDay || 1;
      let cycleStart: Date;
      let cycleEnd: Date;

      if (now.getDate() <= closingDay) {
        // Estamos antes do fechamento: ciclo vai do dia (closingDay+1) do mês anterior até closingDay do mês atual
        cycleStart = new Date(now.getFullYear(), now.getMonth() - 1, closingDay + 1);
        cycleEnd = new Date(now.getFullYear(), now.getMonth(), closingDay, 23, 59, 59, 999);
      } else {
        // Estamos após o fechamento: ciclo vai do dia (closingDay+1) do mês atual até closingDay do mês seguinte
        cycleStart = new Date(now.getFullYear(), now.getMonth(), closingDay + 1);
        cycleEnd = new Date(now.getFullYear(), now.getMonth() + 1, closingDay, 23, 59, 59, 999);
      }

      const currentCycleTxs = card.transactions.filter((tx: any) => {
        const d = new Date(tx.date);
        return d >= cycleStart && d <= cycleEnd;
      });
      const currentInvoice = currentCycleTxs.reduce((sum: number, tx: any) => sum + tx.amount, 0);

      // Também calcula total de todas as transações para exibição
      const totalAllTx = card.transactions.reduce((sum: number, tx: any) => sum + tx.amount, 0);
      const available = card.cardLimit - currentInvoice;
      return { ...card, currentInvoice, totalAllTx, available, cycleStart, cycleEnd };
    });

    return NextResponse.json(cardsWithInvoice);
  } catch (error) {
    console.error('Error fetching cards:', error);
    return NextResponse.json({ error: 'Erro ao buscar cartões' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const body = await req.json();

    const isPJ = session.user.defaultEnv === 'pj';
    const companyId = session.user.activeCompanyId;
    if (isPJ && !companyId) {
      return NextResponse.json({ error: 'Selecione uma empresa ativa' }, { status: 400 });
    }

    const card = await prisma.creditCard.create({
      data: {
        userId: session.user.id,
        companyId: isPJ ? companyId : null,
        scope: isPJ ? 'PJ' : 'PF',
        name: body.name,
        bank: body.bank,
        lastFour: body.lastFour,
        cardLimit: parseFloat(body.cardLimit),
        closingDay: parseInt(body.closingDay),
        dueDay: parseInt(body.dueDay),
        color: body.color || '#2563EB',
        bankConnectionId: body.bankConnectionId || null,
      },
    });
    return NextResponse.json(card, { status: 201 });
  } catch (error) {
    console.error('Error creating card:', error);
    return NextResponse.json({ error: 'Erro ao criar cartão' }, { status: 500 });
  }
}
