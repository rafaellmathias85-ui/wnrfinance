export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET /api/pf/budget?year=2026&month=6
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const year = Number(searchParams.get('year')) || new Date().getFullYear();
  const month = Number(searchParams.get('month')) || new Date().getMonth() + 1;

  const budgets = await prisma.pfBudget.findMany({
    where: { userId: session.user.id, year, month },
    orderBy: [{ group: 'asc' }, { subgroup: 'asc' }],
  });

  return NextResponse.json(budgets);
}

// POST /api/pf/budget  → upsert único por (userId, year, month, group, subgroup)
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const body = await req.json();

  // Suporta upsert em lote: { items: [...] } ou objeto único
  const items: any[] = Array.isArray(body.items) ? body.items : [body];

  const results = await Promise.all(
    items.map(({ year, month, group, subgroup, planned, type }: any) =>
      prisma.pfBudget.upsert({
        where: {
          userId_year_month_group_subgroup: {
            userId: session.user.id,
            year: Number(year),
            month: Number(month),
            group,
            subgroup,
          },
        },
        update: { planned, type },
        create: {
          userId: session.user.id,
          year: Number(year),
          month: Number(month),
          group,
          subgroup,
          planned,
          type,
        },
      })
    )
  );

  return NextResponse.json(results, { status: 201 });
}

// DELETE /api/pf/budget?id=xxx
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });

  const budget = await prisma.pfBudget.findUnique({ where: { id } });
  if (!budget || budget.userId !== session.user.id) {
    return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  }

  await prisma.pfBudget.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
