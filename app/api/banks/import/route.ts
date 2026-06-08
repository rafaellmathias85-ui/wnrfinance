export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { parseStatement } from '@/lib/ofx-parser';
import { createAuditLog } from '@/lib/audit-log';

// POST /api/banks/import
// Body: FormData with fields: file (OFX|CSV), bankConnectionId?
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const bankConnectionId = formData.get('bankConnectionId') as string | null;

    if (!file) return NextResponse.json({ error: 'Arquivo não enviado' }, { status: 400 });

    const allowedExtensions = ['ofx', 'qfx', 'csv'];
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!ext || !allowedExtensions.includes(ext)) {
      return NextResponse.json({ error: 'Formato de arquivo inválido. Use OFX, QFX ou CSV.' }, { status: 400 });
    }

    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'Arquivo muito grande (máx 5MB)' }, { status: 400 });
    }

    const content = await file.text();
    const statement = parseStatement(content, file.name);

    if (!statement.transactions.length) {
      return NextResponse.json({ error: 'Nenhuma transação encontrada no arquivo' }, { status: 400 });
    }

    const userId = session.user.id;
    const batchId = `import_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    let imported = 0;
    let skipped = 0;

    for (const tx of statement.transactions) {
      // Check for duplicates using externalId
      const exists = await prisma.bankTransaction.findFirst({
        where: { userId, externalId: tx.externalId },
      });

      if (exists) { skipped++; continue; }

      await prisma.bankTransaction.create({
        data: {
          userId,
          bankConnectionId: bankConnectionId || null,
          externalId: tx.externalId,
          description: tx.description,
          amount: tx.amount,
          type: tx.type,
          date: tx.date,
          status: 'PENDING',
          importBatchId: batchId,
          rawData: { memo: tx.memo, checkNum: tx.checkNum, source: statement.source } as any,
        },
      });

      imported++;
    }

    await createAuditLog({
      userId,
      action: 'IMPORT',
      entity: 'statement',
      metadata: { filename: file.name, imported, skipped, batchId, source: statement.source },
      request,
    });

    return NextResponse.json({
      success: true,
      imported,
      skipped,
      total: statement.transactions.length,
      batchId,
      bankId: statement.bankId,
      accountId: statement.accountId,
      period: {
        start: statement.startDate,
        end: statement.endDate,
      },
    });
  } catch (error: any) {
    console.error('Bank import error:', error);
    return NextResponse.json({ error: 'Erro ao importar extrato' }, { status: 500 });
  }
}
