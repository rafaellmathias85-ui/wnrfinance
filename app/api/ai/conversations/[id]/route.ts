export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const userId = (session.user as any).id;

    const conv = await prisma.aIConversation.findFirst({
      where: { id: params.id, userId },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!conv) return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 });

    return NextResponse.json({ conversation: conv });
  } catch (error) {
    console.error('[AI conversation GET] Error:', error);
    return NextResponse.json({ error: 'Erro ao buscar conversa' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const userId = (session.user as any).id;

    const conv = await prisma.aIConversation.findFirst({
      where: { id: params.id, userId },
    });

    if (!conv) return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 });

    await prisma.aIConversation.delete({ where: { id: params.id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[AI conversation DELETE] Error:', error);
    return NextResponse.json({ error: 'Erro ao excluir conversa' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

    const userId = (session.user as any).id;
    const body = await req.json();

    const conv = await prisma.aIConversation.findFirst({
      where: { id: params.id, userId },
    });

    if (!conv) return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 });

    const updated = await prisma.aIConversation.update({
      where: { id: params.id },
      data: {
        title: body.title ?? conv.title,
      },
    });

    return NextResponse.json({ conversation: updated });
  } catch (error) {
    console.error('[AI conversation PATCH] Error:', error);
    return NextResponse.json({ error: 'Erro ao atualizar conversa' }, { status: 500 });
  }
}
