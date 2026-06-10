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
  const entity = searchParams.get('entity') ?? undefined;

  const fields = await prisma.customField.findMany({
    where: { companyId, ...(entity ? { entity } : {}), isActive: true },
    orderBy: [{ entity: 'asc' }, { order: 'asc' }],
  });
  return NextResponse.json(fields);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const companyId = session.user.activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });

  const body = await req.json();
  if (!body.name || !body.entity || !body.fieldKey)
    return NextResponse.json({ error: 'name, entity e fieldKey são obrigatórios' }, { status: 400 });

  const field = await prisma.customField.create({
    data: {
      companyId,
      entity: body.entity,
      name: body.name,
      fieldKey: body.fieldKey.toLowerCase().replace(/\s+/g, '_'),
      fieldType: body.fieldType ?? 'text',
      options: body.options ?? undefined,
      required: body.required ?? false,
      order: body.order ?? 0,
    },
  });
  return NextResponse.json(field, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const companyId = session.user.activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });

  const existing = await prisma.customField.findFirst({ where: { id, companyId } });
  if (!existing) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

  const body = await req.json();
  const updated = await prisma.customField.update({
    where: { id },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.fieldType !== undefined && { fieldType: body.fieldType }),
      ...(body.options !== undefined && { options: body.options }),
      ...(body.required !== undefined && { required: body.required }),
      ...(body.order !== undefined && { order: body.order }),
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

  const existing = await prisma.customField.findFirst({ where: { id, companyId } });
  if (!existing) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

  await prisma.customField.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
