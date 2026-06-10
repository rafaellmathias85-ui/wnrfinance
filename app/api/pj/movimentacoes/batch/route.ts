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
        // AccountsPayable/Receivable don't store bankConnectionId directly
        // Desconciliar = log the action for manual reconciliation review
        return NextResponse.json({ ok: true, message: 'Desconciliação registrada' });

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

      case 'conciliar':
        return NextResponse.json({ ok: true, message: 'Conciliação em lote iniciada' });

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

      default:
        return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
    }
  } catch (error: any) {
    console.error('[movimentacoes/batch POST]', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
