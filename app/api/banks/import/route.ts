export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { parseStatement } from '@/lib/ofx-parser';
import { hashFromStatement } from '@/lib/banking/bank-transaction-hash';
import { createAuditLog } from '@/lib/audit-log';

// POST /api/banks/import
// Body: FormData — file (OFX|QFX|CSV), bankConnectionId?
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const bankConnectionId = formData.get('bankConnectionId') as string | null;

    if (!file) return NextResponse.json({ error: 'Arquivo não enviado' }, { status: 400 });

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!ext || !['ofx', 'qfx', 'csv'].includes(ext)) {
      return NextResponse.json({ error: 'Formato inválido. Use OFX, QFX ou CSV.' }, { status: 400 });
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

    // Resolve companyId from the bank connection (null = PF context)
    let connectionCompanyId: string | null = null;
    let bankCode = statement.bankId ?? 'unknown';
    let accountNumber = statement.accountId ?? 'unknown';

    if (bankConnectionId) {
      const conn = await prisma.bankConnection.findFirst({
        where: { id: bankConnectionId },
        select: { companyId: true, bankCode: true, accountNumber: true, agency: true },
      });
      connectionCompanyId = conn?.companyId ?? null;
      if (conn?.bankCode) bankCode = conn.bankCode;
      if (conn?.accountNumber) accountNumber = conn.accountNumber;
    }

    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const tx of statement.transactions) {
      try {
        const txHash = hashFromStatement({
          bankCode,
          account: accountNumber,
          date: tx.date,
          amount: tx.amount,
          description: tx.description,
          documentNumber: tx.checkNum,
        });

        // Dedup by hash first, then fall back to externalId
        const existsByHash = txHash
          ? await prisma.bankTransaction.findFirst({ where: { transactionHash: txHash } })
          : null;

        if (existsByHash) { skipped++; continue; }

        const existsByExtId = tx.externalId
          ? await prisma.bankTransaction.findFirst({ where: { userId, externalId: tx.externalId } })
          : null;

        if (existsByExtId) { skipped++; continue; }

        await prisma.bankTransaction.create({
          data: {
            userId,
            companyId: connectionCompanyId,
            bankConnectionId: bankConnectionId || null,
            externalId: tx.externalId,
            transactionHash: txHash,
            description: tx.description,
            amount: tx.amount,
            type: tx.type,
            date: tx.date,
            documentNumber: tx.checkNum,
            status: 'PENDING',
            importBatchId: batchId,
            rawData: { memo: tx.memo, checkNum: tx.checkNum, source: statement.source } as any,
          },
        });

        imported++;
      } catch (err: any) {
        errors.push(tx.description ?? tx.externalId ?? 'unknown');
      }
    }

    await createAuditLog({
      userId,
      action: 'IMPORT',
      entity: 'statement',
      metadata: { filename: file.name, imported, skipped, errors: errors.length, batchId, source: statement.source },
      request,
    });

    return NextResponse.json({
      success: true,
      imported,
      skipped,
      errors: errors.length,
      total: statement.transactions.length,
      batchId,
      bankId: statement.bankId,
      accountId: statement.accountId,
      period: { start: statement.startDate, end: statement.endDate },
    });
  } catch (error: any) {
    console.error('Bank import error:', error);
    return NextResponse.json({ error: 'Erro ao importar extrato' }, { status: 500 });
  }
}
