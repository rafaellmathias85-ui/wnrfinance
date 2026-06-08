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

    const where: any = { userId: session.user.id };
    if (bankId && bankId !== 'todos') {
      where.bankConnectionId = bankId === 'sem_banco' ? null : bankId;
    }

    const investments = await prisma.investment.findMany({
      where,
      include: { bankConnection: { select: { id: true, bankName: true } } },
      orderBy: { createdAt: 'desc' },
    });

    const totalInvested = investments.reduce((sum: number, inv: any) => sum + inv.amount, 0);
    const totalCurrent = investments.reduce((sum: number, inv: any) => sum + inv.currentValue, 0);
    const totalReturn = totalCurrent - totalInvested;
    const returnPct = totalInvested > 0 ? ((totalReturn / totalInvested) * 100) : 0;

    const byType: Record<string, { invested: number; current: number; count: number }> = {};
    investments.forEach((inv: any) => {
      if (!byType[inv.type]) byType[inv.type] = { invested: 0, current: 0, count: 0 };
      byType[inv.type].invested += inv.amount;
      byType[inv.type].current += inv.currentValue;
      byType[inv.type].count += 1;
    });

    return NextResponse.json({
      investments,
      summary: { totalInvested, totalCurrent, totalReturn, returnPct },
      byType,
    });
  } catch (error) {
    return NextResponse.json({ error: 'Erro ao buscar investimentos' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const body = await req.json();
    const investment = await prisma.investment.create({
      data: {
        userId: session.user.id,
        name: body.name,
        type: body.type,
        broker: body.broker,
        amount: parseFloat(body.amount),
        currentValue: parseFloat(body.currentValue || body.amount),
        purchaseDate: new Date(body.purchaseDate),
        maturityDate: body.maturityDate ? new Date(body.maturityDate) : null,
        notes: body.notes,
        bankConnectionId: body.bankConnectionId || null,
      },
    });
    return NextResponse.json(investment, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Erro ao criar investimento' }, { status: 500 });
  }
}
