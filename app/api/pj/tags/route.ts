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

  const tags = await prisma.tag.findMany({
    where: {
      OR: [
        { companyId, scope: { in: ['PJ', 'AMBOS'] } },
        { isSystem: true, scope: { in: ['PJ', 'AMBOS'] } },
      ],
    },
    orderBy: { name: 'asc' },
  });
  return NextResponse.json(tags);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  const companyId = session.user.activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Nenhuma empresa ativa' }, { status: 400 });

  const body = await req.json();
  if (!body.name?.trim()) return NextResponse.json({ error: 'Nome obrigatório' }, { status: 400 });

  try {
    const tag = await prisma.tag.create({
      data: {
        name: body.name.trim(),
        color: body.color || '#3b82f6',
        description: body.description || null,
        scope: body.scope || 'PJ',
        companyId,
      },
    });
    return NextResponse.json(tag, { status: 201 });
  } catch (e: any) {
    if (e.code === 'P2002') return NextResponse.json({ error: 'Tag já existe' }, { status: 409 });
    throw e;
  }
}
