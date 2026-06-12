export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    const companyId = (session.user as any).activeCompanyId as string;
    if (!companyId) return NextResponse.json({ error: 'Selecione uma empresa' }, { status: 400 });

    const { ids, action } = await req.json();
    if (!ids?.length) return NextResponse.json({ error: 'Nenhum item selecionado' }, { status: 400 });

    switch (action) {
      case 'desconciliar':
        await prisma.pJReconciliation.updateMany({
          where: { companyId, accountId: { in: ids }, status: 'RECONCILED' },
          data: { status: 'PENDING', reconciledAt: null, reconciledBy: null },
        });
        return NextResponse.json({ ok: true });

      case 'estornar':
        await prisma.accountsPayable.updateMany({
          where: { id: { in: ids }, companyId, status: 'pago' },
          data: { status: 'pendente', amountPaid: null, paidAt: null },
        });
        await prisma.accountsReceivable.updateMany({
          where: { id: { in: ids }, companyId, status: 'recebido' },
          data: { status: 'pendente', amountReceived: null, receivedAt: null },
        });
        return NextResponse.json({ ok: true });

      case 'conciliar': {
        const userId = session.user.id;
        for (const id of ids) {
          await prisma.pJReconciliation.upsert({
            where: { id: `manual-${id}` },
            update: { status: 'RECONCILED', reconciledAt: new Date(), reconciledBy: userId, matchMethod: 'manual' },
            create: {
              id: `manual-${id}`,
              companyId,
              type: 'MANUAL',
              accountId: id,
              status: 'RECONCILED',
              matchMethod: 'manual',
              reconciledAt: new Date(),
              reconciledBy: userId,
            },
          });
        }
        return NextResponse.json({ ok: true });
      }

      case 'quitar':
        await prisma.accountsPayable.updateMany({
          where: { id: { in: ids }, companyId, status: 'pendente' },
          data: { status: 'pago', paidAt: new Date() },
        });
        await prisma.accountsReceivable.updateMany({
          where: { id: { in: ids }, companyId, status: 'pendente' },
          data: { status: 'recebido', receivedAt: new Date() },
        });
        return NextResponse.json({ ok: true });

      case 'delete':
        await prisma.accountsPayable.deleteMany({ where: { id: { in: ids }, companyId } });
        await prisma.accountsReceivable.deleteMany({ where: { id: { in: ids }, companyId } });
        return NextResponse.json({ ok: true });

      case 'duplicate': {
        for (const id of ids) {
          const payable = await prisma.accountsPayable.findFirst({ where: { id, companyId } });
          if (payable) {
            const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = payable as any;
            await prisma.accountsPayable.create({ data: { ...rest, status: 'pendente', paidAt: null, amountPaid: null } });
            continue;
          }
          const receivable = await prisma.accountsReceivable.findFirst({ where: { id, companyId } });
          if (receivable) {
            const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = receivable as any;
            await prisma.accountsReceivable.create({ data: { ...rest, status: 'pendente', receivedAt: null, amountReceived: null } });
          }
        }
        return NextResponse.json({ ok: true });
      }

      case 'aprovar':
        await prisma.accountsPayable.updateMany({
          where: { id: { in: ids }, companyId, status: 'pendente' },
          data: { status: 'pago', paidAt: new Date() },
        });
        await prisma.accountsReceivable.updateMany({
          where: { id: { in: ids }, companyId, status: 'pendente' },
          data: { status: 'recebido', receivedAt: new Date() },
        });
        return NextResponse.json({ ok: true });

      default:
        return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
    }
  } catch (error: any) {
    console.error('[movimentacoes/batch POST]', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
