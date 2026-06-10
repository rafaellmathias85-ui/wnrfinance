export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { bankingService } from '@/src/modules/banking/banking.service';
import type { CanonicalTransaction, PersonType } from '@/src/modules/banking/bank-provider.interface';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  try {
    const body = await req.json();
    const personType = (body.personType || (session.user.defaultEnv === 'pj' ? 'PJ' : 'PF')) as PersonType;
    const companyId = personType === 'PJ' ? session.user.activeCompanyId || null : null;

    if (personType === 'PJ' && !companyId) {
      return NextResponse.json({ error: 'Selecione uma empresa ativa' }, { status: 400 });
    }

    const transactions = (body.transactions || []).filter((tx: CanonicalTransaction & { duplicate?: boolean }) => !tx.duplicate);
    if (!transactions.length) {
      return NextResponse.json({ error: 'Nenhuma transação nova para importar' }, { status: 400 });
    }

    const result = await bankingService.confirmStatementImport({
      userId: session.user.id,
      companyId,
      connectionId: body.connectionId || null,
      transactions,
      request: req,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Erro ao confirmar importação' }, { status: 500 });
  }
}
