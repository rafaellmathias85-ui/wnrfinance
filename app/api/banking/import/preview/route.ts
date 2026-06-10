export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { bankingService } from '@/src/modules/banking/banking.service';
import type { PersonType } from '@/src/modules/banking/bank-provider.interface';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'Arquivo não enviado' }, { status: 400 });

  const ext = file.name.split('.').pop()?.toLowerCase();
  if (!ext || !['ofx', 'qfx', 'csv'].includes(ext)) {
    return NextResponse.json({ error: 'Formato inválido. Use OFX, QFX ou CSV.' }, { status: 400 });
  }

  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: 'Arquivo muito grande (máx 5MB)' }, { status: 400 });
  }

  const personType = (formData.get('personType') || (session.user.defaultEnv === 'pj' ? 'PJ' : 'PF')) as PersonType;
  const companyId = personType === 'PJ' ? session.user.activeCompanyId || null : null;
  if (personType === 'PJ' && !companyId) {
    return NextResponse.json({ error: 'Selecione uma empresa ativa' }, { status: 400 });
  }

  const preview = await bankingService.previewStatementImport({
    userId: session.user.id,
    companyId,
    connectionId: String(formData.get('connectionId') || '') || null,
    bankCode: String(formData.get('bankCode') || '') || undefined,
    accountId: String(formData.get('accountId') || '') || undefined,
    personType,
    file: {
      filename: file.name,
      content: await file.text(),
    },
  });

  return NextResponse.json(preview);
}
