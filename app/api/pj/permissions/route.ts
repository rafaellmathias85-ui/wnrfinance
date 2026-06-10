export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !session.user.activeCompanyId) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const rawUserId = searchParams.get('userId');
    if (!rawUserId) {
      return NextResponse.json({ error: 'userId é obrigatório' }, { status: 400 });
    }

    // "me" is a shortcut for the current user
    const targetUserId = rawUserId === 'me' ? session.user.id : rawUserId;

    // Only OWNER/ADMIN can view other users' permissions
    const isSelf = targetUserId === session.user.id;
    if (!isSelf) {
      const requesterMembership = await prisma.userCompany.findFirst({
        where: { userId: session.user.id, companyId: session.user.activeCompanyId },
      });
      if (!['OWNER', 'ADMIN'].includes(requesterMembership?.role || '')) {
        return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
      }
    }

    const permissions = await prisma.userPermission.findMany({
      where: { userId: targetUserId },
    });

    return NextResponse.json({ permissions });
  } catch (error) {
    console.error('GET permissions error:', error);
    return NextResponse.json({ error: 'Erro ao buscar permissões' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !session.user.activeCompanyId) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const requesterMembership = await prisma.userCompany.findFirst({
      where: { userId: session.user.id, companyId: session.user.activeCompanyId },
    });
    if (!['OWNER', 'ADMIN'].includes(requesterMembership?.role || '')) {
      return NextResponse.json({ error: 'Acesso negado — apenas OWNER/ADMIN' }, { status: 403 });
    }

    const body = await request.json();
    const { userId, permissions } = body as {
      userId: string;
      permissions: Array<{ module: string; action: string; allowed: boolean }>;
    };

    // Protect master user — rafaellmathias85@gmail.com must always keep full access
    const targetUser = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    if (targetUser?.email === 'rafaellmathias85@gmail.com') {
      return NextResponse.json({ error: 'Este usuário não pode ter suas permissões alteradas.' }, { status: 403 });
    }

    if (!userId || !Array.isArray(permissions)) {
      return NextResponse.json({ error: 'userId e permissions[] são obrigatórios' }, { status: 400 });
    }

    const upserts = permissions.map((p) =>
      prisma.userPermission.upsert({
        where: { userId_module_action: { userId, module: p.module, action: p.action } },
        create: { userId, module: p.module, action: p.action, allowed: p.allowed },
        update: { allowed: p.allowed },
      })
    );

    await prisma.$transaction(upserts);

    return NextResponse.json({ ok: true, count: upserts.length });
  } catch (error) {
    console.error('POST permissions error:', error);
    return NextResponse.json({ error: 'Erro ao salvar permissões' }, { status: 500 });
  }
}
