export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

async function getBucket(id: string, userId: string) {
  const bucket = await prisma.pfSavingsBucket.findUnique({ where: { id } });
  if (!bucket || bucket.userId !== userId) return null;
  return bucket;
}

// PUT /api/pf/poupanca/[id] → edita bucket
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const bucket = await getBucket(params.id, session.user.id);
  if (!bucket) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

  const { name, description, color, isActive } = await req.json();
  const updated = await prisma.pfSavingsBucket.update({
    where: { id: params.id },
    data: { name, description, color, isActive },
  });

  return NextResponse.json(updated);
}

// DELETE /api/pf/poupanca/[id]
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const bucket = await getBucket(params.id, session.user.id);
  if (!bucket) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

  await prisma.pfSavingsBucket.update({ where: { id: params.id }, data: { isActive: false } });
  return NextResponse.json({ ok: true });
}
