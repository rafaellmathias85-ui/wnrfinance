import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    const { id } = await params;

    const card = await prisma.creditCard.findFirst({
      where: { id, userId: session.user.id },
    });
    if (!card) return NextResponse.json({ error: 'Cartão não encontrado' }, { status: 404 });

    const body = await req.json();
    const amount = parseFloat(body.amount);
    const txDate = new Date(body.date);

    const tx = await prisma.creditCardTransaction.create({
      data: {
        cardId: id,
        description: body.description,
        amount,
        category: body.category,
        date: txDate,
        installments: parseInt(body.installments) || 1,
        currentInstallment: 1,
      },
    });

    // Auto-lança em despesas como pendente (categoria Cartão de Crédito)
    await prisma.expense.create({
      data: {
        userId: session.user.id,
        companyId: card.companyId ?? null,
        description: body.description,
        amount,
        category: body.category || 'Outros',
        date: txDate,
        status: 'pendente',
        paymentMethod: 'CARTAO',
        bankConnectionId: card.bankConnectionId ?? null,
        notes: `cartao:${id}:tx:${tx.id}`,
      },
    });

    return NextResponse.json(tx, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Erro ao criar transação' }, { status: 500 });
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    const { id } = await params;

    const card = await prisma.creditCard.findFirst({ where: { id, userId: session.user.id } });
    if (!card) return NextResponse.json({ error: 'Cartão não encontrado' }, { status: 404 });

    const transactions = await prisma.creditCardTransaction.findMany({
      where: { cardId: id },
      orderBy: { date: 'desc' },
    });

    return NextResponse.json(transactions);
  } catch (error) {
    return NextResponse.json({ error: 'Erro ao buscar transações' }, { status: 500 });
  }
}
