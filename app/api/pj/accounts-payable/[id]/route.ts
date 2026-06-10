export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function PUT(req: NextRequest, { params }: any) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const { id } = await params;
  const companyId = session.user.activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });

  const existing = await prisma.accountsPayable.findFirst({ where: { id, companyId } });
  if (!existing) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

  const body = await req.json();
  const data: any = {};
  if (body.description !== undefined) data.description = body.description;
  if (body.supplierName !== undefined) data.supplierName = body.supplierName;
  if (body.amount !== undefined) data.amount = parseFloat(body.amount);
  if (body.dueDate !== undefined) data.dueDate = new Date(body.dueDate);
  if (body.paidAt !== undefined) data.paidAt = body.paidAt ? new Date(body.paidAt) : null;
  if (body.amountPaid !== undefined) data.amountPaid = body.amountPaid ? parseFloat(body.amountPaid) : null;
  if (body.status !== undefined) data.status = body.status;
  if (body.categoryId !== undefined) data.categoryId = body.categoryId || null;
  if (body.costCenterId !== undefined) data.costCenterId = body.costCenterId || null;
  if (body.notes !== undefined) data.notes = body.notes;
  if (body.paymentMethod !== undefined) data.paymentMethod = body.paymentMethod || null;
  if (body.pixKey !== undefined) data.pixKey = body.pixKey || null;
  if (body.boletoCode !== undefined) data.boletoCode = body.boletoCode || null;
  if (body.transferBank !== undefined) data.transferBank = body.transferBank || null;
  if (body.transferAgency !== undefined) data.transferAgency = body.transferAgency || null;
  if (body.transferAccount !== undefined) data.transferAccount = body.transferAccount || null;
  if (body.transferName !== undefined) data.transferName = body.transferName || null;
  if (body.transferDoc !== undefined) data.transferDoc = body.transferDoc || null;
  if (body.transferAccountType !== undefined) data.transferAccountType = body.transferAccountType || null;
  if (body.launchType !== undefined) data.launchType = body.launchType || null;

  // Handle tags update
  if (body.tagIds !== undefined) {
    await prisma.accountPayableTag.deleteMany({ where: { payableId: id } });
    if (body.tagIds.length > 0) {
      await prisma.accountPayableTag.createMany({
        data: body.tagIds.map((tagId: string) => ({ payableId: id, tagId })),
      });
    }
  }

  const updated = await prisma.accountsPayable.update({
    where: { id },
    data,
    include: { tags: { include: { tag: true } } },
  });
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: any) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const { id } = await params;
  const companyId = session.user.activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });

  const existing = await prisma.accountsPayable.findFirst({ where: { id, companyId } });
  if (!existing) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

  await prisma.accountsPayable.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
