import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    const { id } = await params;

    // Verify card belongs to user
    const card = await prisma.creditCard.findFirst({ where: { id, userId: session.user.id } });
    if (!card) return NextResponse.json({ error: 'Cartão não encontrado' }, { status: 404 });

    const body = await req.json();
    const tx = await prisma.creditCardTransaction.create({
      data: {
        cardId: id,
        description: body.description,
        amount: parseFloat(body.amount),
        category: body.category,
        date: new Date(body.date),
        installments: parseInt(body.installments) || 1,
        currentInstallment: 1,
      },
    });
    return NextResponse.json(tx, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Erro ao criar transação' }, { status: 500 });
  }
}
