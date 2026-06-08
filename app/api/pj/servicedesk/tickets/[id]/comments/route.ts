import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const companyId = (session.user as any).activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Empresa não selecionada' }, { status: 400 });

  const ticket = await prisma.sDTicket.findFirst({ where: { id: params.id, companyId }, select: { id: true } });
  if (!ticket) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

  const items = await prisma.sDTicketComment.findMany({
    where: { ticketId: params.id },
    orderBy: { createdAt: 'asc' },
  });
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const companyId = (session.user as any).activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Empresa não selecionada' }, { status: 400 });

  const ticket = await prisma.sDTicket.findFirst({ where: { id: params.id, companyId }, select: { id: true } });
  if (!ticket) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

  const body = await req.json();
  if (!body.body?.trim()) return NextResponse.json({ error: 'Mensagem obrigatória' }, { status: 400 });

  const user = session.user as any;
  const comment = await prisma.sDTicketComment.create({
    data: {
      ticketId: params.id,
      authorId: user.id,
      authorName: user.name || user.email || 'Usuário',
      body: body.body,
      isInternal: body.isInternal ?? false,
    },
  });
  return NextResponse.json({ item: comment }, { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const companyId = (session.user as any).activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Empresa não selecionada' }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const commentId = searchParams.get('commentId');
  if (!commentId) return NextResponse.json({ error: 'commentId obrigatório' }, { status: 400 });

  const user = session.user as any;
  const comment = await prisma.sDTicketComment.findFirst({
    where: { id: commentId, authorId: user.id },
  });
  if (!comment) return NextResponse.json({ error: 'Não encontrado ou sem permissão' }, { status: 404 });

  await prisma.sDTicketComment.delete({ where: { id: commentId } });
  return NextResponse.json({ success: true });
}
