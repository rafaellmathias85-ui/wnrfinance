import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const companyId = (session.user as any).activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Empresa não selecionada' }, { status: 400 });

  const items = await prisma.sDTicket.findMany({
    where: { companyId },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const companyId = (session.user as any).activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Empresa não selecionada' }, { status: 400 });

  const body = await req.json();
  const item = await prisma.sDTicket.create({
    data: {
      companyId,
      subject: body.subject,
      description: body.description,
      requester: body.requester,
      requesterEmail: body.requesterEmail,
      agentId: body.agentId,
      agentName: body.agentName,
      groupId: body.groupId,
      priority: body.priority,
      status: body.status,
      category: body.category,
      resolution: body.resolution,
      slaDeadline: body.slaDeadline,
    },
  });
  return NextResponse.json({ item }, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const companyId = (session.user as any).activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Empresa não selecionada' }, { status: 400 });

  const body = await req.json();
  if (!body.id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 });

  const existing = await prisma.sDTicket.findFirst({ where: { id: body.id, companyId } });
  if (!existing) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

  const item = await prisma.sDTicket.update({
    where: { id: body.id },
    data: {
      ...(body.subject !== undefined && { subject: body.subject }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.requester !== undefined && { requester: body.requester }),
      ...(body.requesterEmail !== undefined && { requesterEmail: body.requesterEmail }),
      ...(body.agentId !== undefined && { agentId: body.agentId }),
      ...(body.agentName !== undefined && { agentName: body.agentName }),
      ...(body.groupId !== undefined && { groupId: body.groupId }),
      ...(body.priority !== undefined && { priority: body.priority }),
      ...(body.status !== undefined && { status: body.status }),
      ...(body.category !== undefined && { category: body.category }),
      ...(body.resolution !== undefined && { resolution: body.resolution }),
      ...(body.slaDeadline !== undefined && { slaDeadline: body.slaDeadline }),
    },
  });
  return NextResponse.json({ item });
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const companyId = (session.user as any).activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Empresa não selecionada' }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 });

  const existing = await prisma.sDTicket.findFirst({ where: { id, companyId } });
  if (!existing) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

  await prisma.sDTicket.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
