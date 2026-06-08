import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { pluggy } from '@/lib/open-finance';

export const dynamic = 'force-dynamic';

async function getUserConn(userId: string, id: string) {
  // Allow both user-owned (PF) and company-owned (PJ) connections
  return prisma.bankConnection.findFirst({
    where: {
      id,
      OR: [
        { userId },
        { company: { users: { some: { userId } } } },
      ],
    },
  });
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const body = await request.json();
    const { action } = body;

    const conn = await getUserConn(session.user.id, params.id);
    if (!conn) return NextResponse.json({ error: 'Conexão não encontrada' }, { status: 404 });

    if (action === 'sync') {
      // Manual registrations cannot be synced
      if (conn.provider === 'manual') {
        return NextResponse.json(
          { error: 'Cadastros manuais não podem ser sincronizados. Edite os lançamentos manualmente.' },
          { status: 400 },
        );
      }

      if (conn.provider === 'pluggy') {
        if (!(await pluggy.isConfiguredForCompany(conn.companyId))) {
          return NextResponse.json({ error: 'Pluggy não configurado' }, { status: 503 });
        }
        try {
          const item = await pluggy.updateItem(conn.connectionId, conn.companyId);
          const updated = await prisma.bankConnection.update({
            where: { id: conn.id },
            data: {
              status: item.status === 'UPDATED' ? 'active' : 'syncing',
              syncError: item.error?.message || null,
              lastSyncAt: new Date(),
            },
          });
          return NextResponse.json(updated);
        } catch (e: any) {
          const updated = await prisma.bankConnection.update({
            where: { id: conn.id },
            data: { status: 'error', syncError: e?.message?.slice(0, 500) || 'Erro de sincronização' },
          });
          return NextResponse.json(updated, { status: 500 });
        }
      }

      // Other providers (belvo, quanto) not yet implemented
      return NextResponse.json({ error: 'Provedor não suportado para sincronização' }, { status: 400 });
    }

    if (action === 'disconnect') {
      const updated = await prisma.bankConnection.update({
        where: { id: params.id },
        data: { status: 'disconnected' },
      });
      return NextResponse.json(updated);
    }

    if (action === 'reconnect') {
      const updated = await prisma.bankConnection.update({
        where: { id: params.id },
        data: { status: 'active', syncError: null, lastSyncAt: conn.provider === 'manual' ? null : new Date() },
      });
      return NextResponse.json(updated);
    }

    // Handle partial updates (edit manual account)
    if (action === 'update' || !action) {
      const { bankName, accountType, accountNumber, agency, openingBalance, currentBalance, allowsPayments, allowsReceipts, allowsTransfers } = body;
      const updated = await prisma.bankConnection.update({
        where: { id: params.id },
        data: {
          ...(bankName !== undefined && { bankName: String(bankName).trim() }),
          ...(accountType !== undefined && { accountType }),
          ...(accountNumber !== undefined && { accountNumber: accountNumber || null }),
          ...(agency !== undefined && { agency: agency || null }),
          ...(openingBalance !== undefined && { openingBalance: parseFloat(String(openingBalance)) }),
          ...(currentBalance !== undefined && { currentBalance: parseFloat(String(currentBalance)) }),
          ...(allowsPayments !== undefined && { allowsPayments }),
          ...(allowsReceipts !== undefined && { allowsReceipts }),
          ...(allowsTransfers !== undefined && { allowsTransfers }),
        },
      });
      return NextResponse.json(updated);
    }

    return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
  } catch (error) {
    console.error('Error updating bank connection:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const conn = await getUserConn(session.user.id, params.id);
    if (!conn) return NextResponse.json({ error: 'Conexão não encontrada' }, { status: 404 });

    // If Pluggy, try to delete item remotely (best effort)
    if (conn.provider === 'pluggy' && await pluggy.isConfiguredForCompany(conn.companyId)) {
      try {
        await pluggy.deleteItem(conn.connectionId, conn.companyId);
      } catch (e) {
        console.warn('[banks/delete] Pluggy deleteItem failed (continuing):', e);
      }
    }

    await prisma.bankConnection.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting bank connection:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
