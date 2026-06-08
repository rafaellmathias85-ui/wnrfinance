export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    let subscription = await prisma.subscription.findUnique({ where: { userId: session.user.id } });
    if (!subscription) {
      subscription = await prisma.subscription.create({
        data: {
          userId: session.user.id,
          plan: 'free',
          status: 'active',
          trialEndsAt: new Date(Date.now() + 14 * 86400000),
        },
      });
    }

    return NextResponse.json(subscription);
  } catch (error) {
    console.error('Subscription error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
