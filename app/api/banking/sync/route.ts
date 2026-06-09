export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getProvider, buildConfig } from '@/lib/banking/banking.service';

// POST /api/banking/sync
// Body: { connectionId, startDate?, endDate? }
// Fetches latest transactions from the bank API and saves new ones (hash-deduped).
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    const userId = session.user.id;

    const { connectionId, startDate, endDate } = await req.json();
    if (!connectionId) return NextResponse.json({ error: 'connectionId obrigatório' }, { status: 400 });

    const conn = await prisma.bankConnection.findFirst({
      where: { id: connectionId, userId },
    });

    if (!conn) return NextResponse.json({ error: 'Conexão não encontrada' }, { status: 404 });
    if (conn.connectionMode === 'manual') {
      return NextResponse.json({ error: 'Conexão manual não suporta sync automático. Importe o OFX manualmente.' }, { status: 400 });
    }

    // Date range defaults: last 7 days
    const now = new Date();
    const start = startDate ?? new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);
    const end = endDate ?? now.toISOString().slice(0, 10);

    // Mark as syncing
    await prisma.bankConnection.update({ where: { id: connectionId }, data: { status: 'syncing', syncError: null } });

    let imported = 0;
    let skipped = 0;
    let syncError: string | undefined;

    try {
      const provider = getProvider(conn.provider);
      const config = buildConfig({
        bankCode: conn.bankCode,
        agency: conn.agency,
        accountNumber: conn.accountNumber,
        accountDigit: conn.accountDigit,
        clientIdEnc: conn.clientIdEnc,
        clientSecretEnc: conn.clientSecretEnc,
        certPathEnc: conn.certPathEnc,
        certPasswordEnc: conn.certPasswordEnc,
        accessTokenEnc: conn.accessTokenEnc,
        refreshTokenEnc: conn.refreshTokenEnc,
        extra: conn.extraConfig as Record<string, string> | null,
      });

      const transactions = await provider.getTransactions(config, start, end);

      const batchId = `sync_${connectionId}_${Date.now()}`;

      for (const tx of transactions) {
        const existsByHash = tx.transactionHash
          ? await prisma.bankTransaction.findFirst({ where: { transactionHash: tx.transactionHash } })
          : null;
        if (existsByHash) { skipped++; continue; }

        const existsByExtId = tx.externalId
          ? await prisma.bankTransaction.findFirst({ where: { userId, externalId: tx.externalId } })
          : null;
        if (existsByExtId) { skipped++; continue; }

        await prisma.bankTransaction.create({
          data: {
            userId,
            companyId: conn.companyId,
            bankConnectionId: conn.id,
            externalId: tx.externalId,
            transactionHash: tx.transactionHash,
            description: tx.description,
            amount: tx.amount,
            type: tx.type,
            date: tx.date,
            balanceAfter: tx.balanceAfter,
            documentNumber: tx.documentNumber,
            payerName: tx.payerName,
            payerDocument: tx.payerDocument,
            status: 'PENDING',
            importBatchId: batchId,
            rawData: tx.rawPayload as any,
          },
        });
        imported++;
      }

      // Refresh token if provider supports it and token is near expiry
      if (provider.refreshToken && conn.tokenExpiresAt) {
        const minsLeft = (conn.tokenExpiresAt.getTime() - Date.now()) / 60000;
        if (minsLeft < 30) {
          try {
            const refreshed = await provider.refreshToken(config);
            // Token is re-encrypted and stored by a separate /api/banking/connect update call
            // Here we just log that it should be refreshed
            console.log(`Token for ${connectionId} needs refresh — ${minsLeft.toFixed(0)} min left`);
          } catch { /* non-fatal */ }
        }
      }

      await prisma.bankConnection.update({
        where: { id: connectionId },
        data: { status: 'active', lastSyncAt: now, syncError: null, currentBalance: undefined },
      });
    } catch (err: any) {
      syncError = err?.message ?? 'Sync failed';
      await prisma.bankConnection.update({
        where: { id: connectionId },
        data: { status: 'unstable', syncError },
      });
    }

    return NextResponse.json({ imported, skipped, error: syncError ?? null });
  } catch (error: any) {
    console.error('Banking sync error:', error);
    return NextResponse.json({ error: 'Erro ao sincronizar' }, { status: 500 });
  }
}
