export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const sessions = await prisma.userSession.findMany({
    where: { userId: session.user.id, isActive: true },
    orderBy: { lastSeenAt: 'desc' },
    take: 20,
  });

  return NextResponse.json(sessions);
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const url = req.nextUrl.searchParams;
  const sessionId = url.get('sessionId');

  if (sessionId) {
    // Revoke specific session
    await prisma.userSession.updateMany({
      where: { userId: session.user.id, sessionId },
      data: { isActive: false },
    });
  } else {
    // Revoke all other sessions
    const currentSessionId = url.get('current');
    await prisma.userSession.updateMany({
      where: {
        userId: session.user.id,
        isActive: true,
        ...(currentSessionId ? { sessionId: { not: currentSessionId } } : {}),
      },
      data: { isActive: false },
    });
  }

  return NextResponse.json({ ok: true });
}
