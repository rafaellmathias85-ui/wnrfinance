export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { runReceivableAutomation } from '@/lib/receivable-automation';
import { z } from 'zod';

const ContaReceberSchema = z.object({
  description: z.string().min(1, 'Descrição obrigatória').max(500),
  customerName: z.string().max(200).optional().nullable(),
  customerDoc: z.string().max(20).optional().nullable(),
  customerEmail: z.union([z.string().email(), z.literal(''), z.null()]).optional(),
  amount: z.preprocess(Number, z.number().positive('Valor deve ser positivo')),
  dueDate: z.string().min(1, 'Vencimento obrigatório'),
  receivedAt: z.string().optional().nullable(),
  amountReceived: z.preprocess(v => (v ? Number(v) : undefined), z.number().positive().optional()),
  status: z.enum(['pendente', 'recebido', 'vencido', 'cancelado']).optional().default('pendente'),
  categoryId: z.string().optional().nullable(),
  costCenterId: z.string().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  isRecurring: z.boolean().optional().default(false),
  recurrenceType: z.string().max(20).optional().nullable(),
  sourceType: z.string().max(20).optional().default('manual'),
  sourceId: z.string().optional().nullable(),
  autoNfe: z.boolean().optional().default(false),
  autoBoleto: z.boolean().optional().default(false),
  chargeType: z.enum(['boleto', 'pix', 'boleto_pix', 'link']).optional().default('boleto_pix'),
  fiscalRuleId: z.string().optional().nullable(),
  billingPeriod: z.string().max(7).optional().nullable(),
});

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const companyId = session.user.activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });

  const url = new URL(req.url);
  const month = url.searchParams.get('month');
  const year = url.searchParams.get('year');
  const status = url.searchParams.get('status');
  const categoryId = url.searchParams.get('categoryId');

  const where: any = { companyId };
  if (status) where.status = status;
  if (categoryId) where.categoryId = categoryId;
  if (month && year) {
    const start = new Date(Number(year), Number(month) - 1, 1);
    const end = new Date(Number(year), Number(month), 0, 23, 59, 59);
    where.dueDate = { gte: start, lte: end };
  }

  const items = await prisma.accountsReceivable.findMany({
    where,
    include: { category: true, costCenter: true, fiscalRule: true },
    orderBy: { dueDate: 'asc' },
  });

  // Enriquecer com status de NF-e e Boleto para exibição
  const ids = items.map(i => i.id);
  const [nfes, boletos] = await Promise.all([
    prisma.nFe.findMany({
      where: { receivableId: { in: ids }, status: { notIn: ['cancelada', 'rejeitada'] } },
      select: { receivableId: true, id: true, type: true, status: true, pdfUrl: true, accessKey: true, validationStatus: true, errorMessage: true },
    }),
    prisma.boletoCharge.findMany({
      where: { receivableId: { in: ids }, status: { not: 'cancelado' } },
      select: { receivableId: true, id: true, status: true, boletoUrl: true, pixCopiaECola: true, type: true },
    }),
  ]);

  const nfeMap = Object.fromEntries(nfes.map(n => [n.receivableId, n]));
  const boletoMap = Object.fromEntries(boletos.map(b => [b.receivableId, b]));

  const enriched = items.map(item => ({
    ...item,
    nfe: nfeMap[item.id] || null,
    boleto: boletoMap[item.id] || null,
  }));

  return NextResponse.json(enriched);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const companyId = session.user.activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });

  const uc = await prisma.userCompany.findUnique({
    where: { userId_companyId: { userId: session.user.id, companyId } },
  });
  if (!uc || !['OWNER', 'ADMIN', 'FINANCE'].includes(uc.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  }

  const raw = await req.json().catch(() => null);
  const parsed = ContaReceberSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dados inválidos', details: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const body = parsed.data;
  const item = await prisma.accountsReceivable.create({
    data: {
      companyId,
      description: body.description,
      customerName: body.customerName || null,
      customerDoc: body.customerDoc || null,
      customerEmail: body.customerEmail || null,
      amount: body.amount,
      dueDate: new Date(body.dueDate),
      receivedAt: body.receivedAt ? new Date(body.receivedAt) : null,
      amountReceived: body.amountReceived ?? null,
      status: body.status || 'pendente',
      categoryId: body.categoryId || null,
      costCenterId: body.costCenterId || null,
      notes: body.notes || null,
      isRecurring: body.isRecurring || false,
      recurrenceType: body.recurrenceType || null,
      sourceType: body.sourceType || 'manual',
      sourceId: body.sourceId || null,
      autoNfe: !!body.autoNfe,
      autoBoleto: !!body.autoBoleto,
      chargeType: body.chargeType || 'boleto_pix',
      fiscalRuleId: body.fiscalRuleId || null,
      billingPeriod: body.billingPeriod || null,
      createdBy: session.user.id,
    },
  });

  // Disparar automação em background (não bloqueia a resposta)
  if (item.autoNfe || item.autoBoleto) {
    runReceivableAutomation(item.id, companyId).catch(() => {});
  }

  return NextResponse.json(item, { status: 201 });
}
