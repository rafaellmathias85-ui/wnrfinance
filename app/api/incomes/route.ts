export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const IncomeSchema = z.object({
  description: z.string().min(1, 'Descrição obrigatória').max(500),
  amount: z.preprocess(Number, z.number().positive('Valor deve ser positivo')),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Data inválida'),
  type: z.enum(['salario', 'freelance', 'investimentos', 'aluguel', 'dividendos', 'pensao', 'bonus', 'outros']).optional().default('outros'),
  bankConnectionId: z.string().optional().nullable(),
  isRecurring: z.boolean().optional().default(false),
  recurrenceType: z.enum(['semanal', 'quinzenal', 'mensal', 'trimestral', 'semestral', 'anual']).optional().nullable(),
});

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const bankId = searchParams.get('bankId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const statusFilter = searchParams.get('status');

    const isPJ = session.user.defaultEnv === 'pj' && session.user.activeCompanyId;
    const where: any = isPJ
      ? { companyId: session.user.activeCompanyId }
      : { userId: session.user.id, companyId: null };

    if (statusFilter && statusFilter !== 'todos') where.status = statusFilter;
    if (bankId && bankId !== 'todos') {
      where.bankConnectionId = bankId === 'sem_banco' ? null : bankId;
    }
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) where.date.lte = new Date(endDate);
    }

    const incomes = await prisma.income.findMany({
      where,
      include: { bankConnection: { select: { id: true, bankName: true } } },
      orderBy: { date: 'desc' },
    });

    return NextResponse.json(incomes ?? []);
  } catch (error: any) {
    console.error('GET incomes error:', error);
    return NextResponse.json({ error: 'Erro ao buscar receitas' }, { status: 500 });
  }
}

function generateRecurringDates(baseDate: Date, recurrenceType: string): Date[] {
  const dates: Date[] = [];
  const currentYear = baseDate.getFullYear();
  const baseMonth = baseDate.getMonth();
  const baseDay = baseDate.getDate();

  let monthStep = 1;
  if (recurrenceType === 'quinzenal') monthStep = 0.5;
  else if (recurrenceType === 'semanal') monthStep = 0.25;
  else if (recurrenceType === 'trimestral') monthStep = 3;
  else if (recurrenceType === 'semestral') monthStep = 6;
  else if (recurrenceType === 'anual') monthStep = 12;

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
    let nextMonth = baseMonth + monthStep;
    while (nextMonth <= 11) {
      const d = new Date(currentYear, nextMonth, Math.min(baseDay, new Date(currentYear, nextMonth + 1, 0).getDate()));
      dates.push(d);
      nextMonth += monthStep;
    }
  }

  return dates;
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const raw = await request.json().catch(() => null);
    const parsed = IncomeSchema.safeParse(raw ?? {});
    if (!parsed.success) {
      return NextResponse.json({ error: 'Dados inválidos', details: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const { description, amount, date, type, bankConnectionId, isRecurring, recurrenceType } = parsed.data;

    const parsedDate = new Date(date);
    const recurring = isRecurring === true;
    const recType = recurring ? (recurrenceType || 'mensal') : null;

    const income = await prisma.income.create({
      data: {
        description,
        amount: amount,
        date: parsedDate,
        type: type ?? 'outros',
        isRecurring: recurring,
        recurrenceType: recType,
        userId: session.user.id,
        bankConnectionId: bankConnectionId || null,
      },
    });

    // Auto-replicate recurring incomes for remaining months until end of year
    if (recurring && recType) {
      const futureDates = generateRecurringDates(parsedDate, recType);
      if (futureDates.length > 0) {
        await prisma.income.createMany({
          data: futureDates.map((d) => ({
            description,
            amount: amount,
            date: d,
            type: type ?? 'outros',
            isRecurring: true,
            recurrenceType: recType,
            userId: session.user.id,
            bankConnectionId: bankConnectionId || null,
          })),
        });
      }
    }

    return NextResponse.json(income, { status: 201 });
  } catch (error: any) {
    console.error('POST income error:', error);
    return NextResponse.json({ error: 'Erro ao criar receita' }, { status: 500 });
  }
}
