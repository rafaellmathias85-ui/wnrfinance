export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !['admin', 'master'].includes((session.user as any).role)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  const { userId, plan, status } = await req.json();
  if (!userId) return NextResponse.json({ error: 'userId obrigatório' }, { status: 400 });

  const sub = await prisma.subscription.upsert({
    where: { userId },
    update: { ...(plan && { plan }), ...(status && { status }) },
    create: { userId, plan: plan || 'free', status: status || 'active' },
  });

  return NextResponse.json({ id: sub.id, plan: sub.plan, status: sub.status });
}
