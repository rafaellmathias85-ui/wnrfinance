export const dynamic = 'force-dynamic';

// Pendências operacionais do dia (paridade BomControle: cards Inadimplência /
// Aprovar / Conciliar na home). Cada contador linka para a fila correspondente.
// GET /api/pj/dashboard/pendencias

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
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [
      inadimplentes,
      inadimplenciaValor,
      aprovacoesPendentes,
      conciliacaoPendente,
      faturarHoje,
      nfComProblema,
    ] = await Promise.all([
      prisma.accountsReceivable.count({
        where: { companyId, status: { in: ['pendente', 'vencido'] }, dueDate: { lt: startOfToday } },
      }),
      prisma.accountsReceivable.aggregate({
        where: { companyId, status: { in: ['pendente', 'vencido'] }, dueDate: { lt: startOfToday } },
        _sum: { amount: true },
      }),
      prisma.financialApproval.count({ where: { companyId, status: 'pending' } }).catch(() => 0),
      prisma.bankTransaction.count({
        where: { companyId, status: { in: ['PENDING', 'SUGGESTED'] } },
      }),
      prisma.accountsReceivable.count({
        where: {
          companyId,
          billingStatus: 'PREVISTA',
          OR: [{ billingDate: { lte: endOfDay } }, { billingDate: null, dueDate: { lte: endOfDay } }],
        },
      }),
      prisma.nFe.count({
        where: { companyId, OR: [{ status: 'rejeitada' }, { validationStatus: 'blocked', status: { notIn: ['cancelada', 'autorizada'] } }] },
      }),
    ]);

    return NextResponse.json({
      cards: [
        {
          key: 'inadimplencia',
          label: 'Inadimplência',
          count: inadimplentes,
          value: inadimplenciaValor._sum.amount || 0,
          href: '/pj/inadimplencia',
        },
        {
          key: 'aprovar',
          label: 'Aprovar',
          count: aprovacoesPendentes,
          href: '/pj/aprovacao-financeira',
        },
        {
          key: 'conciliar',
          label: 'Conciliar',
          count: conciliacaoPendente,
          href: '/pj/conciliacao/lotes',
        },
        {
          key: 'faturar',
          label: 'Faturar hoje',
          count: faturarHoje,
          href: '/pj/faturamento',
        },
        {
          key: 'fiscal',
          label: 'NF com problema',
          count: nfComProblema,
          href: '/pj/nfe',
        },
      ],
    });
  } catch (error: any) {
    console.error('GET pendencias error:', error);
    return NextResponse.json({ error: 'Erro ao consultar pendências' }, { status: 500 });
  }
}
