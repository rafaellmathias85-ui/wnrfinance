import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const companyId = (session.user as any).activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Empresa não selecionada' }, { status: 400 });

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [total, abertos, emAtendimento, pendentes, resolvidos, fechados, slaExcedido, resolvidosMes, recentes] =
    await Promise.all([
      prisma.sDTicket.count({ where: { companyId } }),
      prisma.sDTicket.count({ where: { companyId, status: 'aberto' } }),
      prisma.sDTicket.count({ where: { companyId, status: 'em_atendimento' } }),
      prisma.sDTicket.count({ where: { companyId, status: 'pendente' } }),
      prisma.sDTicket.count({ where: { companyId, status: 'resolvido' } }),
      prisma.sDTicket.count({ where: { companyId, status: 'fechado' } }),
      prisma.sDTicket.count({
        where: {
          companyId,
          slaDeadline: { lt: now },
          status: { notIn: ['resolvido', 'fechado'] },
        },
      }),
      prisma.sDTicket.count({
        where: {
          companyId,
          status: { in: ['resolvido', 'fechado'] },
          resolvedAt: { gte: startOfMonth },
        },
      }),
      prisma.sDTicket.findMany({
        where: { companyId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          number: true,
          subject: true,
          requester: true,
          agentName: true,
          priority: true,
          status: true,
          createdAt: true,
          slaDeadline: true,
        },
      }),
    ]);

  return NextResponse.json({
    total,
    abertos,
    emAtendimento,
    pendentes,
    resolvidos,
    fechados,
    slaExcedido,
    resolvidosMes,
    recentes,
  });
}
