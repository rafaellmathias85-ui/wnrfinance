import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// POST /api/cards/{id}/finalize
// Finaliza a fatura do mês atual (torna definitiva) e rola a estimativa pro próximo mês.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    const { id } = await params;

    const card = await prisma.creditCard.findFirst({ where: { id, userId: session.user.id } });
    if (!card) return NextResponse.json({ error: 'Cartão não encontrado' }, { status: 404 });

    const body = await req.json();
    const actualTotal: number = parseFloat(body.actualTotal);
    const month: number = body.month ?? new Date().getMonth() + 1;
    const year: number = body.year ?? new Date().getFullYear();
    const estimatedAmount: number = parseFloat(body.estimatedAmount || body.actualTotal);

    const notesKeyCurrentMonth = `fatura_estimada:${id}:${year}-${String(month).padStart(2, '0')}`;

    // 1. Atualiza a despesa do mês atual para definitiva
    const existing = await prisma.expense.findFirst({
      where: { userId: session.user.id, notes: notesKeyCurrentMonth },
    });

    const dueDay = card.dueDay || 10;
    const currentDueDate = new Date(year, month - 1, dueDay);
    const definitiveDescription = `Fatura ${card.name} – Definitiva ${String(month).padStart(2, '0')}/${year}`;

    if (existing) {
      await prisma.expense.update({
        where: { id: existing.id },
        data: {
          amount: actualTotal,
          description: definitiveDescription,
          status: 'pendente',
          notes: `fatura_definitiva:${id}:${year}-${String(month).padStart(2, '0')}`,
        },
      });
    } else {
      await prisma.expense.create({
        data: {
          userId: session.user.id,
          companyId: card.companyId ?? null,
          description: definitiveDescription,
          amount: actualTotal,
          category: 'Cartão de Crédito',
          date: currentDueDate,
          status: 'pendente',
          paymentMethod: 'CARTAO',
          bankConnectionId: card.bankConnectionId ?? null,
          notes: `fatura_definitiva:${id}:${year}-${String(month).padStart(2, '0')}`,
        },
      });
    }

    // 2. Cria estimativa para o próximo mês (apenas se não existir ainda)
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    const notesKeyNextMonth = `fatura_estimada:${id}:${nextYear}-${String(nextMonth).padStart(2, '0')}`;

    const existingNext = await prisma.expense.findFirst({
      where: { userId: session.user.id, notes: notesKeyNextMonth },
    });

    if (!existingNext) {
      const nextDueDate = new Date(nextYear, nextMonth - 1, dueDay);
      await prisma.expense.create({
        data: {
          userId: session.user.id,
          companyId: card.companyId ?? null,
          description: `Fatura ${card.name} – Estimativa ${String(nextMonth).padStart(2, '0')}/${nextYear}`,
          amount: estimatedAmount,
          category: 'Cartão de Crédito',
          date: nextDueDate,
          status: 'pendente',
          paymentMethod: 'CARTAO',
          bankConnectionId: card.bankConnectionId ?? null,
          notes: notesKeyNextMonth,
        },
      });
    }

    return NextResponse.json({ success: true, nextMonth, nextYear });
  } catch (error) {
    console.error('finalize error:', error);
    return NextResponse.json({ error: 'Erro ao finalizar fatura' }, { status: 500 });
  }
}
