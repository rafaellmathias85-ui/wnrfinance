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

  const existing = await prisma.tag.findFirst({ where: { id, companyId } });
  if (!existing) return NextResponse.json({ error: 'Tag não encontrada' }, { status: 404 });
  if (existing.isSystem) return NextResponse.json({ error: 'Tags do sistema não podem ser editadas' }, { status: 403 });

  const body = await req.json();
  const updated = await prisma.tag.update({
    where: { id },
    data: {
      ...(body.name !== undefined && { name: body.name.trim() }),
      ...(body.color !== undefined && { color: body.color }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.scope !== undefined && { scope: body.scope }),
    },
  });
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: any) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const { id } = await params;
  const companyId = session.user.activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });

  const existing = await prisma.tag.findFirst({ where: { id, companyId } });
  if (!existing) return NextResponse.json({ error: 'Tag não encontrada' }, { status: 404 });
  if (existing.isSystem) return NextResponse.json({ error: 'Tags do sistema não podem ser excluídas' }, { status: 403 });

  await prisma.tag.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
