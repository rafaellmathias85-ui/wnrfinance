export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const companyId = session.user.activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });

  const url = req.nextUrl.searchParams;
  const status = url.get('status');
  const type = url.get('type');
  const page = parseInt(url.get('page') || '1');
  const limit = 50;

  const where: any = { companyId };
  if (status) where.status = status;
  if (type) where.type = type;

  const [items, total] = await Promise.all([
    prisma.contract.findMany({
      where,
      include: { category: true, costCenter: true, fiscalRule: true },
      orderBy: { startDate: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.contract.count({ where }),
  ]);

  return NextResponse.json({ items, total, page, pages: Math.ceil(total / limit) });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const companyId = session.user.activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });

  const body = await req.json();
  const {
    clientName, clientId, clientDoc, clientEmail,
    title, type, value, billingCycle,
    categoryId, costCenterId, fiscalRuleId, chargeType, billingDay,
    startDate, endDate, renewalDate, noticeDays, autoRenew,
    requiresNFe, requiresBoleto, autoSendEmail, autoSendWhatsapp, nextBillingDate,
    description, terms,
  } = body;

  if (!clientName || !title || !startDate) {
    return NextResponse.json({ error: 'clientName, title e startDate são obrigatórios' }, { status: 400 });
  }

  const contract = await prisma.contract.create({
    data: {
      companyId,
      clientName,
      clientId: clientId || null,
      clientDoc: clientDoc || null,
      clientEmail: clientEmail || null,
      title,
      type: type || 'servico',
      status: 'ativo',
      value: parseFloat(value) || 0,
      categoryId: categoryId || null,
      costCenterId: costCenterId || null,
      billingCycle: billingCycle || 'mensal',
      startDate: new Date(startDate),
      endDate: endDate ? new Date(endDate) : null,
      renewalDate: renewalDate ? new Date(renewalDate) : null,
      noticeDays: parseInt(noticeDays) || 30,
      autoRenew: !!autoRenew,
      requiresNFe: !!requiresNFe,
      requiresBoleto: !!requiresBoleto,
      billingDay: billingDay ? parseInt(billingDay) : new Date(startDate).getDate(),
      chargeType: chargeType || 'boleto_pix',
      fiscalRuleId: fiscalRuleId || null,
      autoSendEmail: !!autoSendEmail,
      autoSendWhatsapp: !!autoSendWhatsapp,
      nextBillingDate: nextBillingDate ? new Date(nextBillingDate) : new Date(startDate),
      description: description || null,
      terms: terms || null,
      createdBy: session.user.id,
    },
  });

  return NextResponse.json(contract, { status: 201 });
}
