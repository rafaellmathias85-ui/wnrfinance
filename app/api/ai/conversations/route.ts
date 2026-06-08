export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const userId = (session.user as any).id;
    const url = new URL(req.url);
    const env = url.searchParams.get('env') || 'pf';
    const companyId = url.searchParams.get('companyId');

    const conversations = await prisma.aIConversation.findMany({
      where: {
        userId,
        env,
        ...(env === 'pj' && companyId ? { companyId } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          take: 1, // just for preview
        },
        _count: {
          select: { messages: true },
        },
      },
      take: 50,
    });

    return NextResponse.json({ conversations });
  } catch (error) {
    console.error('[AI conversations GET] Error:', error);
    return NextResponse.json({ error: 'Erro ao buscar conversas' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const userId = (session.user as any).id;
    const body = await req.json();
    const env = body.env || 'pf';
    const companyId = body.companyId || null;
    const title = body.title || 'Nova conversa';

    const conv = await prisma.aIConversation.create({
      data: {
        userId,
        env,
        companyId: env === 'pj' ? companyId : null,
        title,
      },
      include: { messages: true },
    });

    return NextResponse.json({ conversation: conv });
  } catch (error) {
    console.error('[AI conversations POST] Error:', error);
    return NextResponse.json({ error: 'Erro ao criar conversa' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const userId = (session.user as any).id;
    const url = new URL(req.url);
    const env = url.searchParams.get('env') || 'pf';
    const companyId = url.searchParams.get('companyId');

    // Delete all conversations for this user/env/company
    await prisma.aIConversation.deleteMany({
      where: {
        userId,
        env,
        ...(env === 'pj' && companyId ? { companyId } : {}),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[AI conversations DELETE] Error:', error);
    return NextResponse.json({ error: 'Erro ao excluir histórico' }, { status: 500 });
  }
}
