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

  const items = await prisma.cRMActivity.findMany({
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
  const item = await prisma.cRMActivity.create({
    data: {
      companyId,
      opportunityId: body.opportunityId,
      type: body.type,
      title: body.title,
      description: body.description,
      contactName: body.contactName,
      contactType: body.contactType,
      dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
      status: body.status || 'pending',
      completed: body.completed ?? false,
      assignedTo: body.assignedTo,
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

  const existing = await prisma.cRMActivity.findFirst({ where: { id: body.id, companyId } });
  if (!existing) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

  const item = await prisma.cRMActivity.update({
    where: { id: body.id },
    data: {
      ...(body.opportunityId !== undefined && { opportunityId: body.opportunityId }),
      ...(body.type !== undefined && { type: body.type }),
      ...(body.title !== undefined && { title: body.title }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.contactName !== undefined && { contactName: body.contactName }),
      ...(body.contactType !== undefined && { contactType: body.contactType }),
      ...(body.dueDate !== undefined && { dueDate: body.dueDate ? new Date(body.dueDate) : null }),
      ...(body.status !== undefined && { status: body.status }),
      ...(body.completed !== undefined && { completed: body.completed }),
      ...(body.assignedTo !== undefined && { assignedTo: body.assignedTo }),
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

  const existing = await prisma.cRMActivity.findFirst({ where: { id, companyId } });
  if (!existing) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

  await prisma.cRMActivity.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
