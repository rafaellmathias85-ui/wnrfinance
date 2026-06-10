export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    const companyId = (session.user as any).activeCompanyId as string;
    if (!companyId) return NextResponse.json({ error: 'Selecione uma empresa' }, { status: 400 });

    const { id } = params;
    const item = await prisma.accountsReceivable.findFirst({ where: { id, companyId } });
    if (!item) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

    const body = await req.json();
    const {
      paymentDate,
      paymentMethod,
      bankConnectionId,
      amountReceived,
      juros = 0,
      multa = 0,
      desconto = 0,
    } = body;

    if (!paymentDate) return NextResponse.json({ error: 'Data de pagamento obrigatória' }, { status: 400 });

    const totalReceived = (parseFloat(amountReceived) || item.amount) + parseFloat(multa) + parseFloat(juros) - parseFloat(desconto);

    const updated = await prisma.accountsReceivable.update({
      where: { id },
      data: {
        status: 'recebido',
        amountReceived: totalReceived,
        receivedAt: new Date(paymentDate),
        notes: item.notes,
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        companyId,
        action: 'UPDATE',
        entity: 'AccountsReceivable',
        entityId: id,
        newData: { status: 'recebido', amountReceived: totalReceived, receivedAt: paymentDate },
        metadata: {
          description: `Quitação registrada. Forma: ${paymentMethod || 'N/A'}. Total: R$ ${totalReceived.toFixed(2)}`,
          userName: session.user.name || session.user.email,
        },
      },
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error('[faturamento/[id]/quitar POST]', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
