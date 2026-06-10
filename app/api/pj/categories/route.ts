export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const companyId = session.user.activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const tree = searchParams.get('tree') === 'true';

  if (tree) {
    // Return full hierarchy tree
    const all = await prisma.businessCategory.findMany({
      where: { companyId },
      include: { children: true },
      orderBy: [{ code: 'asc' }, { name: 'asc' }],
    });
    // Return only root nodes (children are included via relation)
    const roots = all.filter((c) => !c.parentId);
    return NextResponse.json(roots);
  }

  const categories = await prisma.businessCategory.findMany({
    where: { companyId },
    orderBy: [{ code: 'asc' }, { name: 'asc' }],
  });
  return NextResponse.json(categories);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const companyId = session.user.activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });

  const body = await req.json();
  const category = await prisma.businessCategory.create({
    data: {
      companyId,
      name: body.name,
      type: body.type || 'EXPENSE',
      color: body.color || '#3b82f6',
      parentId: body.parentId || null,
      code: body.code || null,
      isSystem: body.isSystem ?? false,
      isActive: body.isActive ?? true,
    },
  });
  return NextResponse.json(category, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const companyId = session.user.activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 });

  const body = await req.json();
  const updated = await prisma.businessCategory.updateMany({
    where: { id, companyId },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.type !== undefined && { type: body.type }),
      ...(body.color !== undefined && { color: body.color }),
      ...(body.parentId !== undefined && { parentId: body.parentId || null }),
      ...(body.code !== undefined && { code: body.code || null }),
      ...(body.isActive !== undefined && { isActive: body.isActive }),
    },
  });
  if (updated.count === 0) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
