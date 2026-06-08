export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const ContaPagarSchema = z.object({
  description: z.string().min(1, 'Descrição obrigatória').max(500),
  supplierName: z.string().max(200).optional().nullable(),
  amount: z.preprocess(Number, z.number().positive('Valor deve ser positivo')),
  dueDate: z.string().min(1, 'Vencimento obrigatório'),
  paidAt: z.string().optional().nullable(),
  amountPaid: z.preprocess(v => (v ? Number(v) : undefined), z.number().positive().optional()),
  status: z.enum(['pendente', 'pago', 'vencido', 'cancelado']).optional().default('pendente'),
  categoryId: z.string().optional().nullable(),
  costCenterId: z.string().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  isRecurring: z.boolean().optional().default(false),
  recurrenceType: z.string().max(20).optional().nullable(),
  paymentMethod: z.string().max(50).optional().nullable(),
  pixKey: z.string().max(200).optional().nullable(),
  boletoCode: z.string().max(200).optional().nullable(),
  transferBank: z.string().max(100).optional().nullable(),
  transferAgency: z.string().max(20).optional().nullable(),
  transferAccount: z.string().max(30).optional().nullable(),
  transferName: z.string().max(200).optional().nullable(),
  transferDoc: z.string().max(30).optional().nullable(),
  transferAccountType: z.string().max(20).optional().nullable(),
  tagIds: z.array(z.string()).optional().default([]),
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
  const costCenterId = url.searchParams.get('costCenterId');

  const where: any = { companyId };
  if (status) where.status = status;
  if (categoryId) where.categoryId = categoryId;
  if (costCenterId) where.costCenterId = costCenterId;
  if (month && year) {
    const start = new Date(Number(year), Number(month) - 1, 1);
    const end = new Date(Number(year), Number(month), 0, 23, 59, 59);
    where.dueDate = { gte: start, lte: end };
  }

  const items = await prisma.accountsPayable.findMany({
    where,
    include: { category: true, costCenter: true, tags: { include: { tag: true } } },
    orderBy: { dueDate: 'asc' },
  });
  return NextResponse.json(items);
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
  const parsed = ContaPagarSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dados inválidos', details: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const body = parsed.data;
  const tagIds: string[] = body.tagIds || [];
  const item = await prisma.accountsPayable.create({
    data: {
      companyId,
      description: body.description,
      supplierName: body.supplierName || null,
      amount: body.amount,
      dueDate: new Date(body.dueDate),
      paidAt: body.paidAt ? new Date(body.paidAt) : null,
      amountPaid: body.amountPaid ?? null,
      status: body.status || 'pendente',
      categoryId: body.categoryId || null,
      costCenterId: body.costCenterId || null,
      notes: body.notes || null,
      isRecurring: body.isRecurring || false,
      recurrenceType: body.recurrenceType || null,
      paymentMethod: body.paymentMethod || null,
      pixKey: body.pixKey || null,
      boletoCode: body.boletoCode || null,
      transferBank: body.transferBank || null,
      transferAgency: body.transferAgency || null,
      transferAccount: body.transferAccount || null,
      transferName: body.transferName || null,
      transferDoc: body.transferDoc || null,
      transferAccountType: body.transferAccountType || null,
      createdBy: session.user.id,
      ...(tagIds.length > 0 ? { tags: { create: tagIds.map((tagId: string) => ({ tagId })) } } : {}),
    },
    include: { tags: { include: { tag: true } } },
  });
  return NextResponse.json(item, { status: 201 });
}
