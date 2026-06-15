export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const DEFAULT_CATEGORIES = [
  { group: 'Receita',   subgroup: 'Salário',                type: 'income'  },
  { group: 'Receita',   subgroup: 'Pró-labore',             type: 'income'  },
  { group: 'Receita',   subgroup: 'Freelance',              type: 'income'  },
  { group: 'Receita',   subgroup: 'Aluguéis',               type: 'income'  },
  { group: 'Receita',   subgroup: 'Dividendos',             type: 'income'  },
  { group: 'Habitação', subgroup: 'Aluguel/Financiamento',  type: 'expense' },
  { group: 'Habitação', subgroup: 'Condomínio',             type: 'expense' },
  { group: 'Habitação', subgroup: 'IPTU',                   type: 'expense' },
  { group: 'Habitação', subgroup: 'Água',                   type: 'expense' },
  { group: 'Habitação', subgroup: 'Luz',                    type: 'expense' },
  { group: 'Habitação', subgroup: 'Internet',               type: 'expense' },
  { group: 'Filhos',    subgroup: 'Escola',                 type: 'expense' },
  { group: 'Filhos',    subgroup: 'Material Escolar',       type: 'expense' },
  { group: 'Filhos',    subgroup: 'Atividades',             type: 'expense' },
  { group: 'Filhos',    subgroup: 'Saúde',                  type: 'expense' },
  { group: 'Automóvel', subgroup: 'Combustível',            type: 'expense' },
  { group: 'Automóvel', subgroup: 'IPVA',                   type: 'expense' },
  { group: 'Automóvel', subgroup: 'Seguro',                 type: 'expense' },
  { group: 'Automóvel', subgroup: 'Manutenção',             type: 'expense' },
  { group: 'Diversos',  subgroup: 'Alimentação',            type: 'expense' },
  { group: 'Diversos',  subgroup: 'Saúde',                  type: 'expense' },
  { group: 'Diversos',  subgroup: 'Lazer',                  type: 'expense' },
  { group: 'Diversos',  subgroup: 'Vestuário',              type: 'expense' },
  { group: 'Diversos',  subgroup: 'Assinaturas',            type: 'expense' },
  { group: 'Diversos',  subgroup: 'Educação',               type: 'expense' },
  { group: 'Poupança',  subgroup: 'Longo Prazo',            type: 'savings' },
  { group: 'Poupança',  subgroup: 'Curto Prazo',            type: 'savings' },
  { group: 'Poupança',  subgroup: 'Emergência',             type: 'savings' },
];

// GET /api/pf/categorias — lista categorias; seed padrão se vazio
export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  let cats = await prisma.pfCategory.findMany({
    where: { userId: session.user.id },
    orderBy: [{ group: 'asc' }, { position: 'asc' }, { subgroup: 'asc' }],
  });

  // Seed padrão na primeira vez
  if (cats.length === 0) {
    const cuid = () => Math.random().toString(36).slice(2, 11) + Date.now().toString(36);
    await prisma.pfCategory.createMany({
      data: DEFAULT_CATEGORIES.map((c, i) => ({
        id: cuid(),
        userId: session.user.id,
        ...c,
        position: i,
      })),
      skipDuplicates: true,
    });
    cats = await prisma.pfCategory.findMany({
      where: { userId: session.user.id },
      orderBy: [{ group: 'asc' }, { position: 'asc' }],
    });
  }

  // Agrupa por group para facilitar o front-end
  const grouped: Record<string, any[]> = {};
  for (const c of cats) {
    if (!grouped[c.group]) grouped[c.group] = [];
    grouped[c.group].push(c);
  }

  return NextResponse.json({ categories: cats, grouped });
}

// POST /api/pf/categorias — cria nova categoria
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const { group, subgroup, type, color } = await req.json();
  if (!group || !subgroup || !type) {
    return NextResponse.json({ error: 'group, subgroup e type são obrigatórios' }, { status: 400 });
  }

  const cat = await prisma.pfCategory.upsert({
    where: { userId_group_subgroup: { userId: session.user.id, group, subgroup } },
    update: { isActive: true, type, color: color ?? '#64748B' },
    create: { userId: session.user.id, group, subgroup, type, color: color ?? '#64748B' },
  });

  return NextResponse.json(cat, { status: 201 });
}
