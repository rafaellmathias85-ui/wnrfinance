import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { runReceivableAutomation } from '@/lib/receivable-automation';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const companyId = (session.user as any).activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Empresa não selecionada' }, { status: 400 });

  const items = await prisma.salesOrder.findMany({
    where: { companyId },
    include: { items: true },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const companyId = (session.user as any).activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Empresa não selecionada' }, { status: 400 });

  const body = await req.json();
  const item = await prisma.salesOrder.create({
    data: {
      companyId,
      number: body.number,
      type: body.type,
      customerId: body.customerId,
      customerName: body.customerName,
      sellerId: body.sellerId,
      sellerName: body.sellerName,
      status: body.status,
      subtotal: body.subtotal,
      discount: body.discount,
      total: body.total,
      notes: body.notes,
      validUntil: body.validUntil,
    },
  });

  // Se criada já como concluída, gerar conta a receber imediatamente
  const receivable = body.status === 'concluido' && body.total > 0
    ? await createReceivableFromSale(item, companyId, session.user.id, body)
    : null;

  return NextResponse.json({ item, receivable }, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const companyId = (session.user as any).activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Empresa não selecionada' }, { status: 400 });

  const body = await req.json();
  if (!body.id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 });

  const existing = await prisma.salesOrder.findFirst({ where: { id: body.id, companyId } });
  if (!existing) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

  const item = await prisma.salesOrder.update({
    where: { id: body.id },
    data: {
      ...(body.number !== undefined && { number: body.number }),
      ...(body.type !== undefined && { type: body.type }),
      ...(body.customerId !== undefined && { customerId: body.customerId }),
      ...(body.customerName !== undefined && { customerName: body.customerName }),
      ...(body.sellerId !== undefined && { sellerId: body.sellerId }),
      ...(body.sellerName !== undefined && { sellerName: body.sellerName }),
      ...(body.status !== undefined && { status: body.status }),
      ...(body.subtotal !== undefined && { subtotal: body.subtotal }),
      ...(body.discount !== undefined && { discount: body.discount }),
      ...(body.total !== undefined && { total: body.total }),
      ...(body.notes !== undefined && { notes: body.notes }),
      ...(body.validUntil !== undefined && { validUntil: body.validUntil }),
    },
  });

  // Quando status muda para "concluido", criar conta a receber automaticamente
  if (body.status === 'concluido' && existing.status !== 'concluido' && item.total > 0) {
    const alreadyExists = await prisma.accountsReceivable.findFirst({
      where: { sourceType: 'sale', sourceId: item.id, companyId },
    });
    if (!alreadyExists) {
      const receivable = await createReceivableFromSale(item, companyId, session.user.id, body);
      return NextResponse.json({ item, receivable });
    }
  }

  return NextResponse.json({ item });
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const companyId = (session.user as any).activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Empresa não selecionada' }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 });

  const existing = await prisma.salesOrder.findFirst({ where: { id, companyId } });
  if (!existing) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

  await prisma.salesOrder.delete({ where: { id } });
  return NextResponse.json({ success: true });
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
async function createReceivableFromSale(sale: any, companyId: string, userId: string, body: any) {
  const dueDate = body.dueDate ? new Date(body.dueDate) : new Date();
  const autoNfe = !!body.autoNfe;
  const autoBoleto = !!body.autoBoleto;

  const receivable = await prisma.accountsReceivable.create({
    data: {
      companyId,
      description: `Venda #${sale.number || sale.id.slice(0, 8)} — ${sale.customerName || 'Cliente'}`,
      customerName: sale.customerName || null,
      customerDoc: body.customerDoc || null,
      customerEmail: body.customerEmail || null,
      amount: sale.total,
      dueDate,
      status: 'pendente',
      sourceType: 'sale',
      sourceId: sale.id,
      autoNfe,
      autoBoleto,
      chargeType: body.chargeType || 'boleto_pix',
      fiscalRuleId: body.fiscalRuleId || null,
      notes: sale.notes || null,
      createdBy: userId,
    },
  });

  if (autoNfe || autoBoleto) {
    runReceivableAutomation(receivable.id, companyId).catch(() => {});
  }

  return receivable;
}
