import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { pluggy, mapPluggySubtype } from '@/lib/open-finance';

export const dynamic = 'force-dynamic';

/**
 * Called by the frontend after the Pluggy Connect Widget completes successfully.
 * Receives { itemId } and creates/updates the BankConnection record.
 */
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    if (false) {
      return NextResponse.json({ error: 'Pluggy não configurado' }, { status: 503 });
    }

    const { itemId } = await request.json();
    if (!itemId) return NextResponse.json({ error: 'itemId é obrigatório' }, { status: 400 });

    const isPJ = session.user.defaultEnv === 'pj';
    const companyId = session.user.activeCompanyId;
    if (isPJ && !companyId) {
      return NextResponse.json({ error: 'Selecione uma empresa ativa' }, { status: 400 });
    }

    if (!(await pluggy.isConfiguredForCompany(companyId ?? null))) {
      return NextResponse.json({ error: 'Pluggy nao configurado' }, { status: 503 });
    }

    // Fetch item + accounts from Pluggy
    const item = await pluggy.getItem(itemId, companyId ?? null);
    const accounts = await pluggy.listAccounts(itemId, companyId ?? null);
    const primary = accounts[0];

    // Prevent duplicate connection for same itemId
    const existing = await prisma.bankConnection.findFirst({ where: { connectionId: itemId } });
    if (existing) {
      const updated = await prisma.bankConnection.update({
        where: { id: existing.id },
        data: {
          status: item.status === 'UPDATED' ? 'active' : item.status === 'LOGIN_ERROR' ? 'error' : 'syncing',
          syncError: item.error?.message || null,
          lastSyncAt: item.lastUpdatedAt ? new Date(item.lastUpdatedAt) : new Date(),
        },
      });
      return NextResponse.json(updated);
    }

    const connection = await prisma.bankConnection.create({
      data: {
        userId: session.user.id,
        companyId: isPJ ? companyId : null,
        scope: isPJ ? 'PJ' : 'PF',
        provider: 'pluggy',
        connectionId: itemId,
        bankName: item.connector?.name || primary?.marketingName || primary?.name || 'Banco',
        bankLogo: item.connector?.imageUrl || null,
        accountType: primary ? mapPluggySubtype(primary.subtype) : 'checking',
        accountNumber: primary?.number || null,
        openingBalance: primary?.balance || 0,
        allowsPayments: true,
        allowsReceipts: true,
        allowsTransfers: true,
        status: item.status === 'UPDATED' ? 'active' : 'syncing',
        syncError: item.error?.message || null,
        lastSyncAt: item.lastUpdatedAt ? new Date(item.lastUpdatedAt) : new Date(),
      },
    });

    return NextResponse.json(connection, { status: 201 });
  } catch (error: any) {
    console.error('[pluggy/callback]', error);
    return NextResponse.json({ error: 'Erro ao processar callback' }, { status: 500 });
  }
}
