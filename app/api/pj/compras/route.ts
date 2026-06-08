export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const companyId = session.user.activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });

  const url = req.nextUrl.searchParams;
  const status = url.get('status');
  const supplierId = url.get('supplierId');
  const page = parseInt(url.get('page') || '1');
  const limit = 50;

  const where: any = { companyId };
  if (status) where.status = status;
  if (supplierId) where.supplierId = supplierId;

  const [items, total] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where,
      orderBy: { orderDate: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.purchaseOrder.count({ where }),
  ]);

  return NextResponse.json({ items, total, page, pages: Math.ceil(total / limit) });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const companyId = session.user.activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });

  const body = await req.json();
  const { supplierName, supplierId, number, orderDate, expectedDate, items, notes, discount, taxes } = body;

  if (!supplierName) return NextResponse.json({ error: 'supplierName é obrigatório' }, { status: 400 });

  const parsedItems = Array.isArray(items) ? items : [];
  const subtotal = parsedItems.reduce((s: number, i: any) => s + (parseFloat(i.total) || 0), 0);
  const total = subtotal - (parseFloat(discount) || 0) + (parseFloat(taxes) || 0);

  // Auto-generate number if not provided
  const count = await prisma.purchaseOrder.count({ where: { companyId } });
  const autoNumber = number || `PC-${String(count + 1).padStart(4, '0')}`;

  const po = await prisma.purchaseOrder.create({
    data: {
      companyId,
      supplierName,
      supplierId: supplierId || null,
      number: autoNumber,
      orderDate: orderDate ? new Date(orderDate) : new Date(),
      expectedDate: expectedDate ? new Date(expectedDate) : null,
      items: parsedItems,
      notes: notes || null,
      subtotal,
      discount: parseFloat(discount) || 0,
      taxes: parseFloat(taxes) || 0,
      total,
      createdBy: session.user.id,
    },
  });

  return NextResponse.json(po, { status: 201 });
}
