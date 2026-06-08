import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const isPJ = session.user.defaultEnv === 'pj';
    const companyId = session.user.activeCompanyId;

    const where: any = isPJ
      ? (companyId ? { companyId, scope: 'PJ' } : { id: '__none__' })
      : { userId: session.user.id, scope: 'PF' };

    const connections = await prisma.bankConnection.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    const transactionCount = isPJ
      ? 0
      : await prisma.transaction.count({ where: { userId: session.user.id } });

    const lastSync = connections.find((c: any) => c.lastSyncAt)?.lastSyncAt || null;

    return NextResponse.json({
      connections,
      stats: {
        totalConnections: connections.length,
        activeConnections: connections.filter((c: any) => c.status === 'active').length,
        totalTransactions: transactionCount,
        lastSync,
      },
    });
  } catch (error) {
    console.error('Error fetching bank connections:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

/**
 * POST /api/banks — Creates a MANUAL bank account registration.
 * For Open Finance connections use POST /api/pluggy/callback after the Connect Widget completes.
 */
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const body = await request.json();
    const {
      bankName,
      bankLogo,
      accountType,
      accountNumber,
      agency,
      openingBalance,
      allowsPayments,
      allowsReceipts,
      allowsTransfers,
    } = body;

    if (!bankName || !String(bankName).trim()) {
      return NextResponse.json({ error: 'Nome do banco é obrigatório' }, { status: 400 });
    }

    const isPJ = session.user.defaultEnv === 'pj';
    const companyId = session.user.activeCompanyId;
    if (isPJ && !companyId) {
      return NextResponse.json({ error: 'Selecione uma empresa ativa' }, { status: 400 });
    }

    // Manual registration — no fake provider name, no fake connectionId.
    // connectionId is a stable human identifier so it is clearly NOT a Pluggy itemId.
    const connectionId = `manual_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

    const connection = await prisma.bankConnection.create({
      data: {
        userId: session.user.id,
        companyId: isPJ ? companyId : null,
        scope: isPJ ? 'PJ' : 'PF',
        provider: 'manual',
        connectionId,
        bankName: String(bankName).trim(),
        bankLogo: bankLogo || null,
        accountType: accountType || 'checking',
        accountNumber: accountNumber || null,
        agency: agency || null,
        openingBalance: openingBalance != null ? parseFloat(openingBalance) : 0,
        currentBalance: openingBalance != null ? parseFloat(openingBalance) : 0,
        allowsPayments: allowsPayments !== false,
        allowsReceipts: allowsReceipts !== false,
        allowsTransfers: allowsTransfers !== false,
        status: 'active',
        // Manual accounts never sync — lastSyncAt stays null so the UI can show
        // "Cadastro manual" instead of a misleading "Última sincronização".
        lastSyncAt: null,
      },
    });

    return NextResponse.json(connection, { status: 201 });
  } catch (error) {
    console.error('Error creating bank connection:', error);
    return NextResponse.json({ error: 'Erro ao criar cadastro' }, { status: 500 });
  }
}
