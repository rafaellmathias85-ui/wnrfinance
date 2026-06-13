export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function PUT(req: NextRequest, { params }: any) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const { id } = await params;
  const companyId = session.user.activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });

  const existing = await prisma.accountsReceivable.findFirst({ where: { id, companyId } });
  if (!existing) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

  const body = await req.json();
  const data: any = {};
  if (body.description !== undefined) data.description = body.description;
  if (body.customerName !== undefined) data.customerName = body.customerName;
  if (body.amount !== undefined) data.amount = parseFloat(body.amount);
  if (body.dueDate !== undefined) data.dueDate = new Date(body.dueDate);
  if (body.receivedAt !== undefined) data.receivedAt = body.receivedAt ? new Date(body.receivedAt) : null;
  if (body.amountReceived !== undefined) data.amountReceived = body.amountReceived ? parseFloat(body.amountReceived) : null;
  if (body.status !== undefined) data.status = body.status;
  if (body.categoryId !== undefined) data.categoryId = body.categoryId || null;
  if (body.costCenterId !== undefined) data.costCenterId = body.costCenterId || null;
  if (body.notes !== undefined) data.notes = body.notes;
  if (body.customerDoc !== undefined) data.customerDoc = body.customerDoc || null;
  if (body.customerEmail !== undefined) data.customerEmail = body.customerEmail || null;
  if (body.autoNfe !== undefined) data.autoNfe = !!body.autoNfe;
  if (body.autoBoleto !== undefined) data.autoBoleto = !!body.autoBoleto;
  if (body.chargeType !== undefined) data.chargeType = body.chargeType || 'boleto_pix';
  if (body.fiscalRuleId !== undefined) data.fiscalRuleId = body.fiscalRuleId || null;
  if (body.billingPeriod !== undefined) data.billingPeriod = body.billingPeriod || null;
  if (body.launchType !== undefined) data.launchType = body.launchType || null;
  if (body.isRecurring !== undefined) data.isRecurring = !!body.isRecurring;
  if (body.recurrenceType !== undefined) data.recurrenceType = body.recurrenceType || null;

  const updated = await prisma.accountsReceivable.update({ where: { id }, data });

  // Gera entradas futuras apenas quando a recorrência está sendo ATIVADA nesta edição
  const recurrenceMonths = body.recurrenceMonths ? parseInt(body.recurrenceMonths, 10) : 0;
  if (!existing.isRecurring && body.isRecurring && recurrenceMonths > 0) {
    const baseDate = updated.dueDate;
    for (let i = 1; i <= recurrenceMonths; i++) {
      const futureDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + i, baseDate.getDate());
      await prisma.accountsReceivable.create({
        data: {
          companyId,
          description: updated.description,
          customerName: updated.customerName || null,
          customerDoc: updated.customerDoc || null,
          customerEmail: updated.customerEmail || null,
          amount: updated.amount,
          dueDate: futureDate,
          status: 'pendente',
          categoryId: updated.categoryId || null,
          costCenterId: updated.costCenterId || null,
          notes: updated.notes || null,
          isRecurring: true,
          recurrenceType: updated.recurrenceType || 'monthly',
          sourceType: updated.sourceType || 'manual',
          autoNfe: false,
          autoBoleto: false,
          chargeType: updated.chargeType || 'boleto_pix',
          fiscalRuleId: updated.fiscalRuleId || null,
          billingPeriod: updated.billingPeriod || null,
          launchType: updated.launchType || null,
          createdBy: session.user.id,
        },
      });
    }
  }

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: any) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const { id } = await params;
  const companyId = session.user.activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });

  const existing = await prisma.accountsReceivable.findFirst({ where: { id, companyId } });
  if (!existing) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

  await prisma.accountsReceivable.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
