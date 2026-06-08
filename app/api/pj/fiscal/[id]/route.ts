export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { createAuditLog } from '@/lib/audit-log';

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !session.user.activeCompanyId) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const { status, paidAmount, paidAt, barCode, receiptUrl, notes } = body;

    const record = await prisma.taxRecord.findFirst({
      where: { id: params.id, companyId: session.user.activeCompanyId },
    });

    if (!record) return NextResponse.json({ error: 'Registro não encontrado' }, { status: 404 });

    const updated = await prisma.taxRecord.update({
      where: { id: params.id },
      data: {
        ...(status !== undefined ? { status } : {}),
        ...(paidAmount !== undefined ? { paidAmount: parseFloat(paidAmount) } : {}),
        ...(paidAt !== undefined ? { paidAt: new Date(paidAt) } : {}),
        ...(barCode !== undefined ? { barCode } : {}),
        ...(receiptUrl !== undefined ? { receiptUrl } : {}),
        ...(notes !== undefined ? { notes } : {}),
      },
    });

    await createAuditLog({
      userId: session.user.id,
      companyId: session.user.activeCompanyId,
      action: 'UPDATE',
      entity: 'tax_record',
      entityId: params.id,
      oldData: { status: record.status, paidAmount: record.paidAmount } as any,
      newData: { status: updated.status, paidAmount: updated.paidAmount } as any,
      request,
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error('PATCH fiscal record error:', error);
    return NextResponse.json({ error: 'Erro ao atualizar registro' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !session.user.activeCompanyId) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    await prisma.taxRecord.deleteMany({
      where: { id: params.id, companyId: session.user.activeCompanyId },
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Erro ao excluir registro' }, { status: 500 });
  }
}
