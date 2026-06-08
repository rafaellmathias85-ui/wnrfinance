export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { calculateDAS, getLast12MonthsRevenue, getMonthRevenue, getDASdueDate, SimplesAnexo, TaxRegime } from '@/lib/tax-pj';

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !session.user.activeCompanyId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()));
    const type = searchParams.get('type'); // DAS, PIS, COFINS, etc.
    const action = searchParams.get('action'); // calculate, list

    const companyId = session.user.activeCompanyId;

    // Return saved tax records
    const where: any = { companyId, year };
    if (type === 'ICMS') {
      where.type = { in: ['ICMS', 'ISS'] };
    } else if (type) {
      where.type = type;
    }

    const records = await prisma.taxRecord.findMany({
      where,
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });

    // Also return DAS calculation for current month if action=calculate
    if (action === 'calculate') {
      const company = await prisma.company.findUnique({ where: { id: companyId }, select: { features: true } });
      const features = company?.features as any || {};
      const regime: TaxRegime = features.taxRegime || 'simples_nacional';
      const anexo: SimplesAnexo = features.simplexAnexo || 'III';

      const now = new Date();
      const month = parseInt(searchParams.get('month') || String(now.getMonth() + 1));

      const bruto12 = await getLast12MonthsRevenue(companyId);
      const receitaMes = await getMonthRevenue(companyId, year, month);
      const das = calculateDAS(regime, receitaMes, bruto12, anexo);
      const dueDate = getDASdueDate(year, month);

      return NextResponse.json({ records, calculation: das, dueDate, regime, month, year });
    }

    return NextResponse.json({ records });
  } catch (error: any) {
    console.error('GET fiscal error:', error);
    return NextResponse.json({ error: 'Erro ao buscar registros fiscais' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !session.user.activeCompanyId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const companyId = session.user.activeCompanyId;
    const body = await request.json();
    const { type, period, year, month, baseValue, taxValue, rate, status, dueDate, paidAt, paidAmount, barCode, notes, generateDAS } = body;

    // Auto-generate DAS from calculation
    if (generateDAS) {
      const company = await prisma.company.findUnique({ where: { id: companyId }, select: { features: true } });
      const features = company?.features as any || {};
      const regime: TaxRegime = features.taxRegime || 'simples_nacional';
      const anexo: SimplesAnexo = features.simplexAnexo || 'III';

      const bruto12 = await getLast12MonthsRevenue(companyId);
      const receitaMes = await getMonthRevenue(companyId, year, month);
      const das = calculateDAS(regime, receitaMes, bruto12, anexo);
      const dueDateCalc = getDASdueDate(year, month);
      const periodStr = `${year}-${String(month).padStart(2, '0')}`;

      const record = await prisma.taxRecord.upsert({
        where: { id: `das_${companyId}_${periodStr}` },
        create: {
          id: `das_${companyId}_${periodStr}`,
          companyId,
          type: 'DAS',
          period: periodStr,
          year,
          month,
          baseValue: receitaMes,
          taxValue: das.dasAmount,
          rate: das.aliquotaEfetiva,
          status: 'aberto',
          dueDate: dueDateCalc,
          metadata: { regime, anexo, bruto12Months: bruto12, details: das.details } as any,
        },
        update: {
          baseValue: receitaMes,
          taxValue: das.dasAmount,
          rate: das.aliquotaEfetiva,
          dueDate: dueDateCalc,
          metadata: { regime, anexo, bruto12Months: bruto12, details: das.details } as any,
        },
      });

      return NextResponse.json(record, { status: 201 });
    }

    if (!type || !period || !year) {
      return NextResponse.json({ error: 'Campos obrigatórios: type, period, year' }, { status: 400 });
    }

    const record = await prisma.taxRecord.create({
      data: {
        companyId,
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
        barCode: barCode || null,
        notes: notes || null,
      },
    });

    return NextResponse.json(record, { status: 201 });
  } catch (error: any) {
    console.error('POST fiscal error:', error);
    return NextResponse.json({ error: 'Erro ao criar registro fiscal' }, { status: 500 });
  }
}
