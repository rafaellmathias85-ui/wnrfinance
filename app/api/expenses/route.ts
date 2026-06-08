export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const ExpenseSchema = z.object({
  description: z.string().min(1, 'Descrição obrigatória').max(500),
  amount: z.preprocess(Number, z.number().positive('Valor deve ser positivo')),
  category: z.string().min(1, 'Categoria obrigatória').max(100),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Data inválida'),
  status: z.enum(['pendente', 'pago']).optional().default('pendente'),
  bankConnectionId: z.string().optional().nullable(),
  isRecurring: z.boolean().optional().default(false),
  recurrenceType: z.enum(['semanal', 'quinzenal', 'mensal', 'trimestral', 'semestral', 'anual']).optional().nullable(),
  isInstallment: z.boolean().optional().default(false),
  totalInstallments: z.number().int().min(2).max(120).optional().nullable(),
  paymentMethod: z.string().max(50).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  tags: z.array(z.string()).optional().default([]),
  boletoCode: z.string().max(200).optional().nullable(),
});

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const bankId = searchParams.get('bankId');
    const status = searchParams.get('status');
    const tag = searchParams.get('tag');

    const isPJ = session.user.defaultEnv === 'pj' && session.user.activeCompanyId;
    const where: any = isPJ
      ? { companyId: session.user.activeCompanyId }
      : { userId: session.user.id, companyId: null };

    if (category && category !== 'todas') where.category = category;
    if (status && status !== 'todos') where.status = status;
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) where.date.lte = new Date(endDate);
    }
    if (bankId && bankId !== 'todos') {
      where.bankConnectionId = bankId === 'sem_banco' ? null : bankId;
    }
    if (tag) {
      where.tags = { some: { tagId: tag } };
    }

    const expenses = await prisma.expense.findMany({
      where,
      include: {
        bankConnection: { select: { id: true, bankName: true } },
        tags: { include: { tag: true } },
      },
      orderBy: { date: 'desc' },
    });

    return NextResponse.json(expenses ?? []);
  } catch (error: any) {
    console.error('GET expenses error:', error);
    return NextResponse.json({ error: 'Erro ao buscar despesas' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const raw = await request.json().catch(() => null);
    const parsed = ExpenseSchema.safeParse(raw ?? {});
    if (!parsed.success) {
      return NextResponse.json({ error: 'Dados inválidos', details: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const {
      description, amount, category, date, status,
      bankConnectionId, isRecurring, recurrenceType,
      isInstallment, totalInstallments,
      paymentMethod, notes, tags, boletoCode,
    } = parsed.data;

    const parsedDate = new Date(date);
    const parsedAmount = amount;
    const isPJ = session.user.defaultEnv === 'pj' && session.user.activeCompanyId;

    const baseData: any = {
      description,
      amount: parsedAmount,
      category,
      status: status ?? 'pendente',
      userId: session.user.id,
      companyId: isPJ ? session.user.activeCompanyId : null,
      bankConnectionId: bankConnectionId || null,
      paymentMethod: paymentMethod || null,
      boletoCode: paymentMethod === 'BOLETO' ? (boletoCode || null) : null,
      notes: notes || null,
    };

    // PARCELAMENTO
    if (isInstallment && totalInstallments && totalInstallments > 1) {
      const groupId = `inst_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const installmentAmount = Math.round((parsedAmount / totalInstallments) * 100) / 100;
      const installments = [];

      for (let i = 0; i < totalInstallments; i++) {
        const instDate = new Date(parsedDate);
        instDate.setMonth(instDate.getMonth() + i);
        installments.push({
          ...baseData,
          description: `${description} (${i + 1}/${totalInstallments})`,
          amount: installmentAmount,
          date: instDate,
          isInstallment: true,
          installmentNumber: i + 1,
          totalInstallments,
          installmentGroupId: groupId,
          isRecurring: false,
          recurrenceType: null,
        });
      }

      await prisma.expense.createMany({ data: installments });
      return NextResponse.json({ success: true, installments: totalInstallments, groupId }, { status: 201 });
    }

    // RECORRENCIA
    const recurring = isRecurring === true;
    const recType = recurring ? (recurrenceType || 'mensal') : null;

    const expense = await prisma.expense.create({
      data: {
        ...baseData,
        date: parsedDate,
        isRecurring: recurring,
        recurrenceType: recType,
      },
    });

    // Vincular tags se fornecidas
    if (tags && Array.isArray(tags) && tags.length > 0) {
      await prisma.expenseTag.createMany({
        data: tags.map((tagId: string) => ({ expenseId: expense.id, tagId })),
        skipDuplicates: true,
      });
    }

    // Auto-replicate recurring for 12 months ahead
    if (recurring && recType) {
      const futureDates = generateRecurringDates(parsedDate, recType, 12);
      if (futureDates.length > 0) {
        await prisma.expense.createMany({
          data: futureDates.map((d) => ({
            ...baseData,
            date: d,
            isRecurring: true,
            recurrenceType: recType,
          })),
        });
      }
    }

    return NextResponse.json(expense, { status: 201 });
  } catch (error: any) {
    console.error('POST expense error:', error);
    return NextResponse.json({ error: 'Erro ao criar despesa' }, { status: 500 });
  }
}

function generateRecurringDates(baseDate: Date, recurrenceType: string, maxMonths: number = 12): Date[] {
  const dates: Date[] = [];
  const baseDay = baseDate.getDate();

  if (recurrenceType === 'semanal') {
    let next = new Date(baseDate);
    for (let i = 0; i < maxMonths * 4; i++) {
      next = new Date(next);
      next.setDate(next.getDate() + 7);
      dates.push(new Date(next));
    }
  } else if (recurrenceType === 'quinzenal') {
    let next = new Date(baseDate);
    for (let i = 0; i < maxMonths * 2; i++) {
      next = new Date(next);
      next.setDate(next.getDate() + 15);
      dates.push(new Date(next));
    }
  } else {
    let monthStep = 1;
    if (recurrenceType === 'trimestral') monthStep = 3;
    else if (recurrenceType === 'semestral') monthStep = 6;
    else if (recurrenceType === 'anual') monthStep = 12;

    for (let i = 1; i <= Math.ceil(maxMonths / monthStep); i++) {
      const d = new Date(baseDate);
      d.setMonth(d.getMonth() + i * monthStep);
      d.setDate(Math.min(baseDay, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
      dates.push(d);
    }
  }

  return dates;
}
