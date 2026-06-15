import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// POST /api/cards/{id}/estimated
// Cria ou atualiza uma despesa estimada para a fatura do cartão
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    const { id } = await params;

    const card = await prisma.creditCard.findFirst({ where: { id, userId: session.user.id } });
    if (!card) return NextResponse.json({ error: 'Cartão não encontrado' }, { status: 404 });

    const body = await req.json();
    const amount = parseFloat(body.amount);
    if (!amount || amount <= 0) return NextResponse.json({ error: 'Valor inválido' }, { status: 400 });

    const now = new Date();
    const month = body.month ?? now.getMonth() + 1;
    const year = body.year ?? now.getFullYear();

    // Monta a data de vencimento da fatura (dueDay do mês)
    const dueDay = card.dueDay || 10;
    const dueDate = new Date(year, month - 1, dueDay);

    const notesKey = `fatura_estimada:${id}:${year}-${String(month).padStart(2, '0')}`;
    const description = `Fatura ${card.name} – Estimativa ${String(month).padStart(2, '0')}/${year}`;

    // Upsert: se já existe, atualiza; senão cria
    const existing = await prisma.expense.findFirst({
      where: { userId: session.user.id, notes: notesKey },
    });

    if (existing) {
      await prisma.expense.update({
        where: { id: existing.id },
        data: { amount, description, date: dueDate },
      });
      return NextResponse.json({ updated: true, expenseId: existing.id });
    }

    const expense = await prisma.expense.create({
      data: {
        userId: session.user.id,
        companyId: card.companyId ?? null,
        description,
        amount,
        category: 'Cartão de Crédito',
        date: dueDate,
        status: 'pendente',
        paymentMethod: 'CARTAO',
        bankConnectionId: card.bankConnectionId ?? null,
        notes: notesKey,
      },
    });

    return NextResponse.json({ created: true, expenseId: expense.id }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Erro ao salvar estimativa' }, { status: 500 });
  }
}
