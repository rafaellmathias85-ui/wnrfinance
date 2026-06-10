export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

async function getCompanyId(session: any) {
  return session?.user?.activeCompanyId as string | undefined;
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const companyId = await getCompanyId(session);
  if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });

  const rules = await prisma.collectionRule.findMany({
    where: { companyId },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ rules });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const companyId = await getCompanyId(session);
  if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });

  const body = await request.json();
  const { name, isActive, triggers } = body;

  if (!name?.trim()) return NextResponse.json({ error: 'Nome obrigatório' }, { status: 400 });
  if (!Array.isArray(triggers) || triggers.length === 0) {
    return NextResponse.json({ error: 'Pelo menos um gatilho é obrigatório' }, { status: 400 });
  }

  const rule = await prisma.collectionRule.create({
    data: { companyId, name: name.trim(), isActive: isActive ?? true, triggers },
  });

  return NextResponse.json(rule, { status: 201 });
}

export async function PUT(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const companyId = await getCompanyId(session);
  if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });

  const body = await request.json();
  const rule = await prisma.collectionRule.updateMany({
    where: { id, companyId },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.isActive !== undefined && { isActive: body.isActive }),
      ...(body.triggers !== undefined && { triggers: body.triggers }),
    },
  });

  if (rule.count === 0) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const companyId = await getCompanyId(session);
  if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });

  await prisma.collectionRule.deleteMany({ where: { id, companyId } });
  return NextResponse.json({ ok: true });
}
