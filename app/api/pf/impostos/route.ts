export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { calculateIRPFMonthly, calculateIRPFAnnual, getCarneLeaoDueDate } from '@/lib/tax-pf';

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()));
    const action = searchParams.get('action'); // calculate_annual, list, monthly_summary
    const userId = session.user.id;

    if (action === 'calculate_annual') {
      const dependents = parseInt(searchParams.get('dependents') || '0');
      const deductions = parseFloat(searchParams.get('deductions') || '0');

      // Sum all incomes for the year
      const incomeAgg = await prisma.income.aggregate({
        where: {
          userId,
          companyId: null,
          status: 'recebido',
          date: { gte: new Date(year, 0, 1), lte: new Date(year, 11, 31) },
        },
        _sum: { amount: true },
      });

      // Sum all carnê-leão entries
      const carneAgg = await prisma.carneLeaoEntry.aggregate({
        where: { userId, year },
        _sum: { grossAmount: true, taxAmount: true },
      });

      const grossIncome = (incomeAgg._sum.amount || 0) + (carneAgg._sum.grossAmount || 0);
      const withheld = carneAgg._sum.taxAmount || 0;

      const result = calculateIRPFAnnual(grossIncome, deductions, dependents, withheld);

      return NextResponse.json({
        year,
        ...result,
        grossIncome,
        withheld,
        message: result.refund > 0
          ? `Você tem direito a restituição de R$ ${result.refund.toFixed(2).replace('.', ',')}`
          : result.balanceDue > 0
          ? `Imposto a pagar: R$ ${result.balanceDue.toFixed(2).replace('.', ',')}`
          : 'Imposto zerado',
      });
    }

    if (action === 'monthly_summary') {
      const month = parseInt(searchParams.get('month') || String(new Date().getMonth() + 1));

      const incomeAgg = await prisma.income.aggregate({
        where: {
          userId,
          companyId: null,
          status: 'recebido',
          date: { gte: new Date(year, month - 1, 1), lte: new Date(year, month - 1, 31) },
        },
        _sum: { amount: true },
      });

      const gross = incomeAgg._sum.amount || 0;
      const result = calculateIRPFMonthly(gross);
      const dueDate = getCarneLeaoDueDate(year, month);

      return NextResponse.json({ year, month, gross, dueDate, ...result });
    }

    // List tax records
    const records = await prisma.taxRecord.findMany({
      where: { userId, year, type: { in: ['IRPF', 'CARNE_LEAO'] } },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });

    return NextResponse.json({ records });
  } catch (error: any) {
    console.error('GET impostos PF error:', error);
    return NextResponse.json({ error: 'Erro ao calcular impostos' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const body = await request.json();
    const { type, period, year, month, baseValue, taxValue, rate, status, dueDate, paidAt, paidAmount, notes } = body;

    if (!type || !period || !year) {
      return NextResponse.json({ error: 'Campos obrigatórios: type, period, year' }, { status: 400 });
    }

    const record = await prisma.taxRecord.create({
      data: {
        userId: session.user.id,
        type,
        period,
        year: parseInt(year),
        month: month ? parseInt(month) : null,
        baseValue: parseFloat(baseValue) || 0,
        taxValue: parseFloat(taxValue) || 0,
        rate: rate ? parseFloat(rate) : null,
        status: status || 'aberto',
        dueDate: dueDate ? new Date(dueDate) : null,
        paidAt: paidAt ? new Date(paidAt) : null,
        paidAmount: paidAmount ? parseFloat(paidAmount) : null,
        notes: notes || null,
      },
    });

    return NextResponse.json(record, { status: 201 });
  } catch (error: any) {
    console.error('POST impostos PF error:', error);
    return NextResponse.json({ error: 'Erro ao criar registro' }, { status: 500 });
  }
}
