export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// PUT /api/pf/categorias/[id] — edita nome/cor
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const cat = await prisma.pfCategory.findUnique({ where: { id: params.id } });
  if (!cat || cat.userId !== session.user.id) {
    return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  }

  const { subgroup, color, position } = await req.json();
  const updated = await prisma.pfCategory.update({
    where: { id: params.id },
    data: { subgroup, color, position },
  });

  return NextResponse.json(updated);
}

// DELETE /api/pf/categorias/[id] — desativa (soft delete)
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const cat = await prisma.pfCategory.findUnique({ where: { id: params.id } });
  if (!cat || cat.userId !== session.user.id) {
    return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  }

  await prisma.pfCategory.update({ where: { id: params.id }, data: { isActive: false } });
  return NextResponse.json({ ok: true });
}
