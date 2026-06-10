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

  const automations = await prisma.cRMAutomation.findMany({
    where: { companyId },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json(automations);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const companyId = session.user.activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });

  const body = await req.json();
  if (!body.name || !body.trigger || !body.actions?.length) {
    return NextResponse.json({ error: 'Campos obrigatórios: name, trigger, actions' }, { status: 400 });
  }

  const automation = await prisma.cRMAutomation.create({
    data: {
      companyId,
      name: body.name,
      trigger: body.trigger,
      conditions: body.conditions ?? null,
      actions: body.actions,
      isActive: body.isActive ?? true,
    },
  });
  return NextResponse.json(automation, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const companyId = session.user.activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });

  const body = await req.json();
  const existing = await prisma.cRMAutomation.findFirst({ where: { id, companyId } });
  if (!existing) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

  const updated = await prisma.cRMAutomation.update({
    where: { id },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.trigger !== undefined && { trigger: body.trigger }),
      ...(body.conditions !== undefined && { conditions: body.conditions }),
      ...(body.actions !== undefined && { actions: body.actions }),
      ...(body.isActive !== undefined && { isActive: body.isActive }),
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

  const existing = await prisma.cRMAutomation.findFirst({ where: { id, companyId } });
  if (!existing) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

  await prisma.cRMAutomation.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
