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

  const items = await prisma.stockMovement.findMany({
    where: { companyId },
    include: { product: { select: { name: true, code: true } }, warehouse: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const companyId = (session.user as any).activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Empresa não selecionada' }, { status: 400 });

  const body = await req.json();
  const { productId, warehouseId, type, quantity, unitCost, notes, reference } = body;
  if (!productId || !type || !quantity) {
    return NextResponse.json({ error: 'productId, type e quantity obrigatórios' }, { status: 400 });
  }

  const product = await prisma.product.findFirst({ where: { id: productId, companyId } });
  if (!product) return NextResponse.json({ error: 'Produto não encontrado' }, { status: 404 });

  const totalCost = unitCost ? unitCost * Math.abs(quantity) : undefined;
  const delta = ['entrada', 'ajuste'].includes(type) ? Math.abs(quantity) : -Math.abs(quantity);

  const [movement] = await prisma.$transaction([
    prisma.stockMovement.create({
      data: {
        companyId, productId, warehouseId: warehouseId || null, type,
        quantity: Math.abs(quantity), unitCost: unitCost || null,
        totalCost: totalCost || null, reference: reference || null,
        notes: notes || null, createdBy: (session.user as any).name || null,
      },
    }),
    prisma.product.update({
      where: { id: productId },
      data: { currentStock: { increment: delta } },
    }),
  ]);

  return NextResponse.json({ item: movement }, { status: 201 });
}
