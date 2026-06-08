export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

function generateRecurringDates(baseDate: Date, recurrenceType: string): Date[] {
  const dates: Date[] = [];
  const currentYear = baseDate.getFullYear();
  const baseMonth = baseDate.getMonth();
  const baseDay = baseDate.getDate();

  if (recurrenceType === 'semanal') {
    let nextDate = new Date(baseDate);
    nextDate.setDate(nextDate.getDate() + 7);
    while (nextDate.getFullYear() === currentYear) {
      dates.push(new Date(nextDate));
      nextDate = new Date(nextDate);
      nextDate.setDate(nextDate.getDate() + 7);
    }
  } else if (recurrenceType === 'quinzenal') {
    let nextDate = new Date(baseDate);
    nextDate.setDate(nextDate.getDate() + 15);
    while (nextDate.getFullYear() === currentYear) {
      dates.push(new Date(nextDate));
      nextDate = new Date(nextDate);
      nextDate.setDate(nextDate.getDate() + 15);
    }
  } else {
    let monthStep = 1;
    if (recurrenceType === 'trimestral') monthStep = 3;
    else if (recurrenceType === 'semestral') monthStep = 6;
    else if (recurrenceType === 'anual') monthStep = 12;
    let nextMonth = baseMonth + monthStep;
    while (nextMonth <= 11) {
      const d = new Date(currentYear, nextMonth, Math.min(baseDay, new Date(currentYear, nextMonth + 1, 0).getDate()));
      dates.push(d);
      nextMonth += monthStep;
    }
  }
  return dates;
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    // Fetch existing income to check if it was already recurring
    const existing = await prisma.income.findFirst({
      where: { id: params.id, userId: session.user.id },
    });
    if (!existing) return NextResponse.json({ error: 'Receita não encontrada' }, { status: 404 });

    const body = await request.json();
    const recurring = body?.isRecurring === true;
    const recType = recurring ? (body?.recurrenceType || 'mensal') : null;
    const wasRecurring = existing.isRecurring;

    await prisma.income.update({
      where: { id: params.id },
      data: {
        description: body?.description,
        amount: body?.amount ? parseFloat(body.amount) : undefined,
        date: body?.date ? new Date(body.date) : undefined,
        type: body?.type,
        isRecurring: recurring,
        recurrenceType: recType,
        bankConnectionId: body?.bankConnectionId || null,
      },
    });

    // If changed to recurring (was not before), replicate for remaining months
    if (recurring && recType && !wasRecurring) {
      const baseDate = body?.date ? new Date(body.date) : existing.date;
      const futureDates = generateRecurringDates(baseDate, recType);
      if (futureDates.length > 0) {
        await prisma.income.createMany({
          data: futureDates.map((d) => ({
            description: body?.description ?? existing.description,
            amount: body?.amount ? parseFloat(body.amount) : existing.amount,
            date: d,
            type: body?.type ?? existing.type,
            isRecurring: true,
            recurrenceType: recType,
            userId: session.user.id,
            bankConnectionId: existing.bankConnectionId,
          })),
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('PUT income error:', error);
    return NextResponse.json({ error: 'Erro ao atualizar receita' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const income = await prisma.income.deleteMany({
      where: { id: params.id, userId: session.user.id },
    });

    if (income.count === 0) return NextResponse.json({ error: 'Receita não encontrada' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('DELETE income error:', error);
    return NextResponse.json({ error: 'Erro ao excluir receita' }, { status: 500 });
  }
}
