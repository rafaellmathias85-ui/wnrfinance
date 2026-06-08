export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { pluggy, mapPluggyCategory } from '@/lib/open-finance';
import crypto from 'crypto';

function verifyInternalSecret(req: NextRequest): boolean {
  const expected = process.env.INTERNAL_API_SECRET;
  const provided = req.headers.get('x-internal-secret');
  if (!expected || !provided) return false;
  if (expected.length !== provided.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}

// POST /api/pluggy/sync
// Called by: user action (manual sync) or internal webhook trigger
// Body: { connectionId } — our BankConnection.id
export async function POST(req: NextRequest) {
  const isInternal = verifyInternalSecret(req);

  let userId: string | undefined;
  let companyId: string | null | undefined;

  if (!isInternal) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    userId = session.user.id;
    companyId = session.user.activeCompanyId;
  }

  const body = await req.json().catch(() => ({}));
  const { connectionId } = body;
  if (!connectionId) return NextResponse.json({ error: 'connectionId obrigatório' }, { status: 400 });

  const connection = await prisma.bankConnection.findUnique({
    where: { id: connectionId },
    select: { id: true, userId: true, companyId: true, connectionId: true, lastSyncAt: true },
  });
  if (!connection) return NextResponse.json({ error: 'Conexão não encontrada' }, { status: 404 });

  // Auth check for non-internal calls
  if (!isInternal && connection.userId !== userId) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  const pluggyCompanyId = connection.companyId ?? companyId ?? null;

  if (!(await pluggy.isConfiguredForCompany(pluggyCompanyId))) {
    return NextResponse.json({ error: 'Pluggy não configurado' }, { status: 503 });
  }

  const itemId = connection.connectionId;
  if (!itemId) return NextResponse.json({ error: 'Item Pluggy não encontrado' }, { status: 400 });

  try {
    // Mark as syncing
    await prisma.bankConnection.update({
      where: { id: connectionId },
      data: { status: 'syncing', syncError: null },
    });

    // Get accounts from Pluggy
    const accounts = await pluggy.listAccounts(itemId, pluggyCompanyId);
    if (!accounts.length) {
      await prisma.bankConnection.update({ where: { id: connectionId }, data: { status: 'active' } });
      return NextResponse.json({ synced: 0 });
    }

    // Sync transactions from last 90 days (or since last sync)
    const lastSync = connection.lastSyncAt ? new Date(connection.lastSyncAt) : null;
    const fromDate = lastSync || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const toDate = new Date();

    let totalSynced = 0;

    for (const account of accounts) {
      const txs = await pluggy.listTransactions(account.id, fromDate, toDate, pluggyCompanyId);

      for (const tx of txs) {
        const existing = await prisma.bankTransaction.findFirst({
          where: { bankConnectionId: connectionId, externalId: tx.id },
        });
        if (existing) continue;

        await prisma.bankTransaction.create({
          data: {
            userId: connection.userId,
            bankConnectionId: connectionId,
            externalId: tx.id,
            date: new Date(tx.date),
            description: tx.description,
            amount: Math.abs(tx.amount),
            type: tx.type === 'CREDIT' ? 'credit' : 'debit',
            category: mapPluggyCategory(tx.category),
            balanceAfter: tx.balance ?? null,
            status: 'PENDING',
            rawData: {
              pluggyId: tx.id,
              pluggyCategory: tx.category,
              descriptionRaw: tx.descriptionRaw,
              merchant: tx.merchant,
              providerCode: tx.providerCode,
            },
          },
        });
        totalSynced++;
      }

      // Update account balance
      await prisma.bankConnection.update({
        where: { id: connectionId },
        data: { currentBalance: account.balance },
      });
    }

    await prisma.bankConnection.update({
      where: { id: connectionId },
      data: {
        status: 'active',
        lastSyncAt: toDate,
        syncError: null,
      },
    });

    return NextResponse.json({ synced: totalSynced, accounts: accounts.length });
  } catch (error: any) {
    await prisma.bankConnection.update({
      where: { id: connectionId },
      data: { status: 'error', syncError: error.message },
    }).catch(() => {});

    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
