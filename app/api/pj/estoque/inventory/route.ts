export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

// POST: apply batch inventory count (array of {productId, countedQty, notes})
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const companyId = (session.user as any).activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Empresa não selecionada' }, { status: 400 });

  const body = await req.json();
  const items: { productId: string; countedQty: number; notes?: string }[] = body.items ?? [];

  if (!Array.isArray(items) || items.length === 0)
    return NextResponse.json({ error: 'items obrigatório' }, { status: 400 });

  const results: { productId: string; delta: number }[] = [];

  for (const item of items) {
    const product = await prisma.product.findFirst({ where: { id: item.productId, companyId } });
    if (!product) continue;

    const delta = item.countedQty - (product.currentStock ?? 0);
    if (delta === 0) continue; // no change needed

    await prisma.$transaction([
      prisma.stockMovement.create({
        data: {
          companyId,
          productId: product.id,
          type: 'inventario',
          quantity: Math.abs(delta),
          notes: item.notes || `Inventário físico — ajuste ${delta > 0 ? '+' : ''}${delta}`,
          reference: `INV-${new Date().toISOString().slice(0, 10)}`,
          createdBy: (session.user as any).name || null,
        },
      }),
      prisma.product.update({
        where: { id: product.id },
        data: { currentStock: item.countedQty },
      }),
    ]);

    results.push({ productId: product.id, delta });
  }

  return NextResponse.json({ adjusted: results.length, results });
}
