import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    const companyId = session.user.activeCompanyId;
    if (!companyId) return NextResponse.json({ error: 'Selecione uma empresa ativa' }, { status: 400 });

    const { id } = await params;
    const body = await req.json();

    const existing = await prisma.receivableNegotiation.findFirst({ where: { id, companyId } });
    if (!existing) return NextResponse.json({ error: 'Negociação não encontrada' }, { status: 404 });

    const data: any = {};
    if (body.status) data.status = body.status;
    if (body.nextContact !== undefined) data.nextContact = body.nextContact ? new Date(body.nextContact) : null;
    if (body.notes !== undefined) data.notes = body.notes;
    if (body.newAmount) data.newAmount = parseFloat(body.newAmount);
    if (body.newDueDate) data.newDueDate = new Date(body.newDueDate);
    if (body.installments) data.installments = parseInt(body.installments);

    const updated = await prisma.receivableNegotiation.update({ where: { id }, data });

    // If marked as paid and linked to a receivable, mark the receivable as received
    if (body.status === 'pago' && existing.receivableId) {
      await prisma.accountsReceivable.update({
        where: { id: existing.receivableId },
        data: { status: 'recebido', amountReceived: existing.newAmount, receivedAt: new Date() },
      });
    }

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Error updating negotiation:', error);
    return NextResponse.json({ error: 'Erro ao atualizar' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    const companyId = session.user.activeCompanyId;
    if (!companyId) return NextResponse.json({ error: 'Selecione uma empresa ativa' }, { status: 400 });

    const { id } = await params;
    await prisma.receivableNegotiation.deleteMany({ where: { id, companyId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting negotiation:', error);
    return NextResponse.json({ error: 'Erro ao excluir' }, { status: 500 });
  }
}
