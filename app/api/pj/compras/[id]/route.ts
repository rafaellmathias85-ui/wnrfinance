export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 });

  const companyId = session.user.activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });
  const po = await prisma.purchaseOrder.findFirst({ where: { id: params.id, companyId } });
  if (!po) return NextResponse.json({ error: 'Pedido nao encontrado' }, { status: 404 });

  return NextResponse.json(po);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 });

  const companyId = session.user.activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });
  const po = await prisma.purchaseOrder.findFirst({ where: { id: params.id, companyId } });
  if (!po) return NextResponse.json({ error: 'Pedido nao encontrado' }, { status: 404 });

  const body = await req.json();
  const { action, ...fields } = body;

  // Handle status transitions
  let extra: any = {};
  if (action === 'approve') {
    extra = { status: 'aprovado', approvedBy: session.user.id, approvedAt: new Date() };
  } else if (action === 'receive') {
    extra = { status: 'recebido', receivedDate: new Date() };
  } else if (action === 'cancel') {
    extra = { status: 'cancelado' };
  }

  if (fields.items) {
    const parsedItems = Array.isArray(fields.items) ? fields.items : [];
    const subtotal = parsedItems.reduce((s: number, i: any) => s + (parseFloat(i.total) || 0), 0);
    const discount = parseFloat(fields.discount ?? po.discount) || 0;
    const taxes = parseFloat(fields.taxes ?? po.taxes) || 0;
    fields.subtotal = subtotal;
    fields.total = subtotal - discount + taxes;
  }

  const updated = await prisma.purchaseOrder.update({
    where: { id: params.id },
    data: {
      ...extra,
      ...(fields.supplierName !== undefined && { supplierName: fields.supplierName }),
      ...(fields.supplierId !== undefined && { supplierId: fields.supplierId }),
      ...(fields.expectedDate !== undefined && { expectedDate: fields.expectedDate ? new Date(fields.expectedDate) : null }),
      ...(fields.notes !== undefined && { notes: fields.notes }),
      ...(fields.items !== undefined && { items: fields.items }),
      ...(fields.subtotal !== undefined && { subtotal: fields.subtotal }),
      ...(fields.discount !== undefined && { discount: parseFloat(fields.discount) }),
      ...(fields.taxes !== undefined && { taxes: parseFloat(fields.taxes) }),
      ...(fields.total !== undefined && { total: fields.total }),
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 });

  const companyId = session.user.activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });
  const po = await prisma.purchaseOrder.findFirst({ where: { id: params.id, companyId } });
  if (!po) return NextResponse.json({ error: 'Pedido nao encontrado' }, { status: 404 });
  if (!['rascunho', 'cancelado'].includes(po.status)) {
    return NextResponse.json({ error: 'Apenas rascunhos podem ser excluidos' }, { status: 400 });
  }

  await prisma.purchaseOrder.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}