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
      currentBalance: true,
      status: true,
    },
    orderBy: { bankName: 'asc' },
  });

  const bancaria = accounts.filter(a => !a.accountType || ['checking', 'savings'].includes(a.accountType ?? ''));
  const credito  = accounts.filter(a => a.accountType === 'credit');
  const outros   = accounts.filter(a => a.accountType === 'investment' || (a.accountType && !['checking', 'savings', 'credit'].includes(a.accountType)));

  const sum = (arr: typeof accounts) => arr.reduce((s, a) => s + (a.currentBalance ?? a.openingBalance ?? 0), 0);

  return NextResponse.json({
    bancaria: { accounts: bancaria, total: sum(bancaria) },
    credito:  { accounts: credito,  total: sum(credito)  },
    outros:   { accounts: outros,   total: sum(outros)   },
    totalBancario: sum(bancaria) + sum(outros),
  });
}
