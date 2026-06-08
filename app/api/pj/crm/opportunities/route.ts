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

  const items = await prisma.cRMOpportunity.findMany({
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
  const item = await prisma.cRMOpportunity.create({
    data: {
      companyId,
      title: body.title,
      company: body.company,
      value: body.value,
      funnelId: body.funnelId,
      status: body.status,
      probability: body.probability,
      assignedTo: body.assignedTo,
      contactName: body.contactName,
      contactEmail: body.contactEmail,
      lostReason: body.lostReason,
      notes: body.notes,
      expectedClose: body.expectedClose,
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

  const existing = await prisma.cRMOpportunity.findFirst({ where: { id: body.id, companyId } });
  if (!existing) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

  const item = await prisma.cRMOpportunity.update({
    where: { id: body.id },
    data: {
      ...(body.title !== undefined && { title: body.title }),
      ...(body.company !== undefined && { company: body.company }),
      ...(body.value !== undefined && { value: body.value }),
      ...(body.funnelId !== undefined && { funnelId: body.funnelId }),
      ...(body.status !== undefined && { status: body.status }),
      ...(body.probability !== undefined && { probability: body.probability }),
      ...(body.assignedTo !== undefined && { assignedTo: body.assignedTo }),
      ...(body.contactName !== undefined && { contactName: body.contactName }),
      ...(body.contactEmail !== undefined && { contactEmail: body.contactEmail }),
      ...(body.lostReason !== undefined && { lostReason: body.lostReason }),
      ...(body.notes !== undefined && { notes: body.notes }),
      ...(body.expectedClose !== undefined && { expectedClose: body.expectedClose }),
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

  const existing = await prisma.cRMOpportunity.findFirst({ where: { id, companyId } });
  if (!existing) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

  await prisma.cRMOpportunity.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
