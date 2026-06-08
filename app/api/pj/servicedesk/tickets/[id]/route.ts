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

  const ticket = await (prisma.sDTicket as any).findFirst({
    where: { id: params.id, companyId },
    include: { comments: { orderBy: { createdAt: 'asc' } } },
  });
  if (!ticket) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

  return NextResponse.json({ item: ticket });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const companyId = (session.user as any).activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Empresa não selecionada' }, { status: 400 });

  const existing = await prisma.sDTicket.findFirst({ where: { id: params.id, companyId } });
  if (!existing) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

  const body = await req.json();
  const now = new Date();

  const data: any = {};
  if (body.subject !== undefined) data.subject = body.subject;
  if (body.description !== undefined) data.description = body.description;
  if (body.requester !== undefined) data.requester = body.requester;
  if (body.requesterEmail !== undefined) data.requesterEmail = body.requesterEmail;
  if (body.agentId !== undefined) data.agentId = body.agentId;
  if (body.agentName !== undefined) data.agentName = body.agentName;
  if (body.groupId !== undefined) data.groupId = body.groupId;
  if (body.typeId !== undefined) data.typeId = body.typeId;
  if (body.priority !== undefined) data.priority = body.priority;
  if (body.category !== undefined) data.category = body.category;
  if (body.tags !== undefined) data.tags = body.tags;
  if (body.resolution !== undefined) data.resolution = body.resolution;
  if (body.slaDeadline !== undefined) data.slaDeadline = body.slaDeadline ? new Date(body.slaDeadline) : null;

  if (body.status !== undefined && body.status !== existing.status) {
    data.status = body.status;
    if (body.status === 'resolvido' && !existing.resolvedAt) data.resolvedAt = now;
    if (body.status === 'fechado' && !existing.closedAt) data.closedAt = now;
  }

  const item = await prisma.sDTicket.update({ where: { id: params.id }, data });
  return NextResponse.json({ item });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const companyId = (session.user as any).activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Empresa não selecionada' }, { status: 400 });

  const existing = await prisma.sDTicket.findFirst({ where: { id: params.id, companyId } });
  if (!existing) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

  await prisma.sDTicket.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}
