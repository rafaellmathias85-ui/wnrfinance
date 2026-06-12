export const dynamic = 'force-dynamic';

// Monitor fiscal (paridade BomControle: ícone "SEFAZ" com contador de pendências).
// GET /api/pj/fiscal/monitor → contadores de NF com problema + certificados a vencer.

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !session.user.activeCompanyId) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }
  const companyId = session.user.activeCompanyId;

  try {
    const in45Days = new Date();
    in45Days.setDate(in45Days.getDate() + 45);

    const [nfeErrors, nfeBlocked, nfePending, expiringCerts] = await Promise.all([
      prisma.nFe.count({ where: { companyId, status: 'rejeitada' } }),
      prisma.nFe.count({ where: { companyId, validationStatus: 'blocked', status: { notIn: ['cancelada', 'autorizada'] } } }),
      prisma.nFe.count({ where: { companyId, status: 'enviada' } }),
      prisma.companyCertificate.findMany({
        where: { companyId, isActive: true, expiresAt: { not: null, lte: in45Days } },
        select: { id: true, fileName: true, expiresAt: true },
        orderBy: { expiresAt: 'asc' },
      }),
    ]);

    const now = Date.now();
    const certificates = expiringCerts.map((c) => ({
      ...c,
      daysToExpire: c.expiresAt ? Math.ceil((c.expiresAt.getTime() - now) / 86400000) : null,
      expired: c.expiresAt ? c.expiresAt.getTime() < now : false,
    }));

    const totalIssues = nfeErrors + nfeBlocked + certificates.length;

    return NextResponse.json({
      totalIssues,
      nfe: { rejected: nfeErrors, blocked: nfeBlocked, processing: nfePending },
      certificates,
    });
  } catch (error: any) {
    console.error('GET fiscal monitor error:', error);
    return NextResponse.json({ error: 'Erro ao consultar monitor fiscal' }, { status: 500 });
  }
}
