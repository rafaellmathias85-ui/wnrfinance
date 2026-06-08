export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET /api/lgpd/export — Export all personal data for the authenticated user (LGPD Art. 18)
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const userId = session.user.id;

  try {
    const [user, expenses, incomes, bankConnections, bankTransactions, alerts, taxRecords, carneLeao] =
      await Promise.all([
        prisma.user.findUnique({
          where: { id: userId },
          select: {
            id: true, name: true, email: true, createdAt: true, updatedAt: true,
            role: true, defaultEnv: true,
          },
        }),
        prisma.expense.findMany({ where: { userId }, orderBy: { date: 'desc' } }),
        prisma.income.findMany({ where: { userId }, orderBy: { date: 'desc' } }),
        prisma.bankConnection.findMany({ where: { userId }, select: { id: true, bankName: true, createdAt: true, status: true } }),
        prisma.bankTransaction.findMany({ where: { userId }, orderBy: { date: 'desc' }, take: 5000 }),
        prisma.alert.findMany({ where: { userId } }),
        prisma.taxRecord.findMany({ where: { userId } }),
        prisma.carneLeaoEntry.findMany({ where: { userId } }),
      ]);

    const exportData = {
      exportedAt: new Date().toISOString(),
      requestedBy: userId,
      legalBasis: 'LGPD Art. 18, inciso V — portabilidade dos dados',
      data: {
        profile: user,
        expenses: { count: expenses.length, records: expenses },
        incomes: { count: incomes.length, records: incomes },
        bankConnections: { count: bankConnections.length, records: bankConnections },
        bankTransactions: { count: bankTransactions.length, records: bankTransactions },
        alerts: { count: alerts.length, records: alerts },
        taxRecords: { count: taxRecords.length, records: taxRecords },
        carneLeao: { count: carneLeao.length, records: carneLeao },
      },
    };

    return new NextResponse(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="meus-dados-wnr-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  } catch (err) {
    console.error('LGPD export error:', err);
    return NextResponse.json({ error: 'Erro ao exportar dados' }, { status: 500 });
  }
}
