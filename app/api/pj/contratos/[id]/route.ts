export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { generateContractBilling } from '@/lib/billing-automation';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 });
  const companyId = session.user.activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });
  const contract = await prisma.contract.findFirst({ where: { id: params.id, companyId } });
  if (!contract) return NextResponse.json({ error: 'Contrato nao encontrado' }, { status: 404 });
  return NextResponse.json(contract);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 });
  const companyId = session.user.activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });
  const contract = await prisma.contract.findFirst({ where: { id: params.id, companyId } });
  if (!contract) return NextResponse.json({ error: 'Contrato nao encontrado' }, { status: 404 });

  const body = await req.json();
  const { action, ...fields } = body;

  if (action === 'generate_billing') {
    try {
      const result = await generateContractBilling({
        companyId,
        contractId: contract.id,
        userId: session.user.id,
        period: fields.period,
        dueDate: fields.dueDate ? new Date(fields.dueDate) : undefined,
        description: fields.description,
        notes: fields.notes,
      });
      return NextResponse.json(result, { status: result.duplicated ? 200 : 201 });
    } catch (error: any) {
      return NextResponse.json({ error: error.message || 'Erro ao gerar faturamento' }, { status: 400 });
    }
  }

  let extra: any = {};
  if (action === 'suspend') {
    extra = { status: 'suspenso' };
  } else if (action === 'reactivate') {
    extra = { status: 'ativo' };
  } else if (action === 'terminate') {
    extra = { status: 'encerrado', terminatedAt: new Date(), terminationReason: fields.terminationReason || null };
  } else if (action === 'renew') {
    const months = parseInt(fields.months) || 12;
    const base = contract.endDate || new Date();
    const newEnd = new Date(base);
    newEnd.setMonth(newEnd.getMonth() + months);
    const newRenewal = new Date(newEnd);
    newRenewal.setDate(newRenewal.getDate() - (contract.noticeDays || 30));
    extra = { status: 'ativo', endDate: newEnd, renewalDate: newRenewal };
  }

  const updated = await prisma.contract.update({
    where: { id: params.id },
    data: {
      ...extra,
      ...(fields.clientName !== undefined && { clientName: fields.clientName }),
      ...(fields.title !== undefined && { title: fields.title }),
      ...(fields.value !== undefined && { value: parseFloat(fields.value) }),
      ...(fields.categoryId !== undefined && { categoryId: fields.categoryId || null }),
      ...(fields.costCenterId !== undefined && { costCenterId: fields.costCenterId || null }),
      ...(fields.billingCycle !== undefined && { billingCycle: fields.billingCycle }),
      ...(fields.startDate !== undefined && { startDate: new Date(fields.startDate) }),
      ...(fields.endDate !== undefined && { endDate: fields.endDate ? new Date(fields.endDate) : null }),
      ...(fields.renewalDate !== undefined && { renewalDate: fields.renewalDate ? new Date(fields.renewalDate) : null }),
      ...(fields.autoRenew !== undefined && { autoRenew: !!fields.autoRenew }),
      ...(fields.noticeDays !== undefined && { noticeDays: parseInt(fields.noticeDays) }),
      ...(fields.requiresNFe !== undefined && { requiresNFe: !!fields.requiresNFe }),
      ...(fields.requiresBoleto !== undefined && { requiresBoleto: !!fields.requiresBoleto }),
      ...(fields.billingDay !== undefined && { billingDay: fields.billingDay ? parseInt(fields.billingDay) : null }),
      ...(fields.chargeType !== undefined && { chargeType: fields.chargeType || 'boleto_pix' }),
      ...(fields.fiscalRuleId !== undefined && { fiscalRuleId: fields.fiscalRuleId || null }),
      ...(fields.autoSendEmail !== undefined && { autoSendEmail: !!fields.autoSendEmail }),
      ...(fields.autoSendWhatsapp !== undefined && { autoSendWhatsapp: !!fields.autoSendWhatsapp }),
      ...(fields.nextBillingDate !== undefined && { nextBillingDate: fields.nextBillingDate ? new Date(fields.nextBillingDate) : null }),
      ...(fields.clientDoc !== undefined && { clientDoc: fields.clientDoc }),
      ...(fields.clientEmail !== undefined && { clientEmail: fields.clientEmail }),
      ...(fields.description !== undefined && { description: fields.description }),
      ...(fields.terms !== undefined && { terms: fields.terms }),
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 });
  const companyId = session.user.activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });
  const contract = await prisma.contract.findFirst({ where: { id: params.id, companyId } });
  if (!contract) return NextResponse.json({ error: 'Contrato nao encontrado' }, { status: 404 });
  if (contract.status === 'ativo') {
    return NextResponse.json({ error: 'Encerre o contrato antes de excluir' }, { status: 400 });
  }
  await prisma.contract.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
