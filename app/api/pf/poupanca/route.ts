export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET /api/pf/poupanca → lista buckets com saldo e últimos aportes
export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const buckets = await prisma.pfSavingsBucket.findMany({
    where: { userId: session.user.id, isActive: true },
    include: {
      entries: {
        orderBy: { date: 'desc' },
        take: 12,
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json(buckets);
}

// POST /api/pf/poupanca → cria bucket
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const { name, description, color } = await req.json();
  if (!name) return NextResponse.json({ error: 'name é obrigatório' }, { status: 400 });

  const bucket = await prisma.pfSavingsBucket.create({
    data: {
      userId: session.user.id,
      name,
      description: description || null,
      color: color || '#3B82F6',
    },
  });

  return NextResponse.json(bucket, { status: 201 });
}
