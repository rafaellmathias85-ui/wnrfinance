export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const companyId = session.user.activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const period = searchParams.get('period') ?? undefined;
  const status = searchParams.get('status') ?? undefined;
  const agentName = searchParams.get('agent') ?? undefined;

  // Support year-only filter (e.g., "2026") or full month (e.g., "2026-06")
  const periodFilter = period
    ? period.length === 4
      ? { startsWith: period }
      : { equals: period }
    : undefined;

  const commissions = await prisma.commission.findMany({
    where: {
      companyId,
      ...(periodFilter ? { period: periodFilter } : {}),
      ...(status ? { status } : {}),
      ...(agentName ? { agentName: { contains: agentName, mode: 'insensitive' } } : {}),
    },
    orderBy: { createdAt: 'desc' },
  });

  const totalPendente = commissions.filter(c => c.status === 'pendente').reduce((s, c) => s + c.amount, 0);
  const totalAprovada = commissions.filter(c => c.status === 'aprovada').reduce((s, c) => s + c.amount, 0);
  const totalPaga = commissions.filter(c => c.status === 'paga').reduce((s, c) => s + c.amount, 0);

  return NextResponse.json({ commissions, totals: { pendente: totalPendente, aprovada: totalAprovada, paga: totalPaga } });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const companyId = session.user.activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });

  const body = await req.json();
  if (!body.agentName || body.amount == null)
    return NextResponse.json({ error: 'agentName e amount são obrigatórios' }, { status: 400 });

  const commission = await prisma.commission.create({
    data: {
      companyId,
      agentName: body.agentName,
      agentId: body.agentId ?? null,
      referenceId: body.referenceId ?? null,
      referenceType: body.referenceType ?? 'manual',
      description: body.description ?? null,
      saleAmount: body.saleAmount ?? 0,
      rate: body.rate ?? 0,
      amount: body.amount,
      period: body.period ?? new Date().toISOString().slice(0, 7),
      notes: body.notes ?? null,
    },
  });
  return NextResponse.json(commission, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const companyId = session.user.activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });

  const existing = await prisma.commission.findFirst({ where: { id, companyId } });
  if (!existing) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

  const body = await req.json();
  const updated = await prisma.commission.update({
    where: { id },
    data: {
      ...(body.status !== undefined && { status: body.status }),
      ...(body.amount !== undefined && { amount: body.amount }),
      ...(body.notes !== undefined && { notes: body.notes }),
      ...(body.paidAt !== undefined && { paidAt: body.paidAt ? new Date(body.paidAt) : null }),
    },
  });
  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const companyId = session.user.activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });

  const existing = await prisma.commission.findFirst({ where: { id, companyId } });
  if (!existing) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

  await prisma.commission.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
