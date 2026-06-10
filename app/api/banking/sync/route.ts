export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { bankingService } from '@/src/modules/banking/banking.service';
import { runBankSyncJob } from '@/src/modules/banking/bank-sync-job';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const body = await req.json().catch(() => ({}));

  try {
    if (!body.connectionId) {
      const result = await runBankSyncJob();
      return NextResponse.json(result);
    }

    const result = await bankingService.syncConnection({
      userId: session.user.id,
      companyId: session.user.defaultEnv === 'pj' ? session.user.activeCompanyId || null : undefined,
      connectionId: body.connectionId,
      startDate: body.startDate ? new Date(body.startDate) : undefined,
      endDate: body.endDate ? new Date(body.endDate) : undefined,
      request: req,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Erro ao sincronizar' }, { status: 500 });
  }
}
