export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/pj/sefaz/status
 * Retorna o status de saúde de todas as conexões NFS-e da empresa ativa.
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const companyId = session.user.activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });

  const connections = await prisma.companyConnection.findMany({
    where: { companyId, category: 'nfe' },
    select: {
      id: true,
      providerKey: true,
      displayName: true,
      status: true,
      lastHealthAt: true,
      lastError: true,
      isActive: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  const overall =
    connections.length === 0
      ? 'sem_conexao'
      : connections.some(c => c.status === 'erro')
        ? 'erro'
        : connections.some(c => c.status === 'atencao')
          ? 'atencao'
          : 'ok';

  return NextResponse.json({ overall, connections });
}
