export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json([], { status: 401 });
  const companyId = (session.user as any).activeCompanyId;
  if (!companyId) return NextResponse.json([]);
  const employees = await prisma.supplier.findMany({
    where: { companyId, supplierType: 'employee', isActive: true },
    orderBy: { name: 'asc' },
  });
  return NextResponse.json(employees);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 });
  const companyId = (session.user as any).activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Selecione uma empresa' }, { status: 400 });
  const body = await req.json();
  const employee = await prisma.supplier.create({
    data: {
      companyId,
      supplierType: 'employee',
      name: body.name,
      document: body.document || null,
      email: body.email || null,
      phone: body.phone || null,
      address: body.address || null,
      city: body.city || null,
      state: body.state || null,
      position: body.position || null,
      salary: body.salary ? Number(body.salary) : null,
      hiredAt: body.hiredAt ? new Date(body.hiredAt) : null,
      notes: body.notes || null,
    },
  });
  return NextResponse.json(employee, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 });
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID obrigatorio' }, { status: 400 });
  const body = await req.json();
  const employee = await prisma.supplier.update({
    where: { id },
    data: {
      name: body.name,
      document: body.document || null,
      email: body.email || null,
      phone: body.phone || null,
      address: body.address || null,
      city: body.city || null,
      state: body.state || null,
      position: body.position || null,
      salary: body.salary ? Number(body.salary) : null,
      hiredAt: body.hiredAt ? new Date(body.hiredAt) : null,
      notes: body.notes || null,
    },
  });
  return NextResponse.json(employee);
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 });
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID obrigatorio' }, { status: 400 });
  await prisma.supplier.update({ where: { id }, data: { isActive: false } });
  return NextResponse.json({ ok: true });
}
