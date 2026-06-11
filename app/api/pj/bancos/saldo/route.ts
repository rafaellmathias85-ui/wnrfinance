export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const companyId = session.user.activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });

  const accounts = await prisma.bankConnection.findMany({
    where: { companyId, scope: 'PJ', status: { not: 'DISABLED' } },
    select: {
      id: true,
      bankName: true,
      bankCode: true,
      bankLogo: true,
      accountType: true,
      accountNumber: true,
      agency: true,
      openingBalance: true,
      status: true,
    },
    orderBy: { bankName: 'asc' },
  });

  const accountIds = accounts.map(a => a.id);
  const today = new Date();
  today.setHours(23, 59, 59, 999);

  // Aggregate bank transaction credits and debits per account up to today
  const [credits, debits] = await Promise.all([
    prisma.bankTransaction.groupBy({
      by: ['bankConnectionId'],
      where: {
        bankConnectionId: { in: accountIds },
        type: 'credit',
        date: { lte: today },
        status: { not: 'IGNORED' },
      },
      _sum: { amount: true },
    }),
    prisma.bankTransaction.groupBy({
      by: ['bankConnectionId'],
      where: {
        bankConnectionId: { in: accountIds },
        type: 'debit',
        date: { lte: today },
        status: { not: 'IGNORED' },
      },
      _sum: { amount: true },
    }),
  ]);

  const creditMap = new Map(credits.map(c => [c.bankConnectionId, c._sum.amount ?? 0]));
  const debitMap  = new Map(debits.map(d  => [d.bankConnectionId,  d._sum.amount ?? 0]));

  // calculatedBalance = openingBalance + imported credits − imported debits
  const enriched = accounts.map(a => ({
    ...a,
    calculatedBalance: (a.openingBalance ?? 0) + (creditMap.get(a.id) ?? 0) - (debitMap.get(a.id) ?? 0),
  }));

  const bancaria = enriched.filter(a => !a.accountType || ['checking', 'savings'].includes(a.accountType ?? ''));
  const credito  = enriched.filter(a => a.accountType === 'credit');
  const outros   = enriched.filter(a => a.accountType === 'investment' || (a.accountType && !['checking', 'savings', 'credit'].includes(a.accountType)));

  const sum = (arr: typeof enriched) => arr.reduce((s, a) => s + a.calculatedBalance, 0);

  return NextResponse.json({
    bancaria: { accounts: bancaria, total: sum(bancaria) },
    credito:  { accounts: credito,  total: sum(credito)  },
    outros:   { accounts: outros,   total: sum(outros)   },
    totalBancario: sum(bancaria) + sum(outros),
  });
}
