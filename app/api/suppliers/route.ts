export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// PF suppliers (userId-based)
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json([], { status: 401 });
  const userId = (session.user as any).id;
  const suppliers = await prisma.supplier.findMany({
    where: { userId, isActive: true },
    orderBy: { name: 'asc' },
  });
  return NextResponse.json(suppliers);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 });
  const userId = (session.user as any).id;
  const body = await req.json();
  const supplier = await prisma.supplier.create({
    data: {
      userId,
      name: body.name,
      document: body.document || null,
      email: body.email || null,
      phone: body.phone || null,
    },
  });
  return NextResponse.json(supplier, { status: 201 });
}
