import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// DELETE all PF bank transactions (companyId = null) for the current user.
// Reconciliation and ReconciliationLog records cascade-delete automatically.
export async function DELETE() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const userId = session.user.id;

    const { count } = await prisma.bankTransaction.deleteMany({
      where: { userId, companyId: null },
    });

    return NextResponse.json({ deleted: count });
  } catch (error) {
    console.error('Cleanup error:', error);
    return NextResponse.json({ error: 'Erro ao limpar base' }, { status: 500 });
  }
}
