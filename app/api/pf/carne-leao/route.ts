export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { calculateIRPFMonthly, getCarneLeaoDueDate, summarizeCarneLeao, CarneLeaoIncomeType } from '@/lib/tax-pf';

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()));
    const month = searchParams.get('month') ? parseInt(searchParams.get('month')!) : undefined;
    const userId = session.user.id;

    const where: any = { userId, year };
    if (month) where.month = month;

    const entries = await prisma.carneLeaoEntry.findMany({
      where,
      orderBy: [{ year: 'desc' }, { month: 'desc' }, { createdAt: 'desc' }],
    });

    const summary = summarizeCarneLeao(entries);

    return NextResponse.json({ entries, summary });
  } catch (error: any) {
    return NextResponse.json({ error: 'Erro ao buscar carnê-leão' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const body = await request.json();
    const { period, incomeType, sourceName, sourceDoc, grossAmount, deductions, dependents, notes } = body;

    if (!period || !incomeType || !sourceName || !grossAmount) {
      return NextResponse.json({ error: 'Campos obrigatórios: período, tipo, fonte e valor' }, { status: 400 });
    }

    const [yearStr, monthStr] = period.split('-');
    const year = parseInt(yearStr);
    const month = parseInt(monthStr);

    const gross = parseFloat(grossAmount);
    const ded = parseFloat(deductions || '0');
    const deps = parseInt(dependents || '0');

    const calc = calculateIRPFMonthly(gross, ded, deps);
    const dueDate = getCarneLeaoDueDate(year, month);

    const entry = await prisma.carneLeaoEntry.create({
      data: {
        userId: session.user.id,
        period,
        year,
        month,
        incomeType: incomeType as CarneLeaoIncomeType,
        sourceName,
        sourceDoc: sourceDoc || null,
        grossAmount: gross,
        deductions: calc.deductions,
        netAmount: calc.taxableBase,
        taxAmount: calc.taxDue,
        rate: calc.rate,
        notes: notes || null,
      },
    });

    // Optionally create a TaxRecord for the DAS/carnê tracking
    await prisma.taxRecord.upsert({
      where: { id: `carne_${session.user.id}_${period}` },
      create: {
        id: `carne_${session.user.id}_${period}`,
        userId: session.user.id,
        type: 'CARNE_LEAO',
        period,
        year,
        month,
        baseValue: gross,
        taxValue: calc.taxDue,
        rate: calc.rate,
        status: 'aberto',
        dueDate,
      },
      update: {},
    }).catch(() => {});

    return NextResponse.json({ entry, calculation: calc, dueDate }, { status: 201 });
  } catch (error: any) {
    console.error('POST carnê-leão error:', error);
    return NextResponse.json({ error: 'Erro ao criar lançamento' }, { status: 500 });
  }
}
