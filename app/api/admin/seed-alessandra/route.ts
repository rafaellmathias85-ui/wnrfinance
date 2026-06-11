export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';

// One-time endpoint to seed the Alessandra user.
// Protected by NEXTAUTH_SECRET as Bearer token.
export async function POST(req: NextRequest) {
  try {
    // Rota one-off já utilizada — desativada por padrão (princípio de menor superfície).
    // Para reativar temporariamente: ALLOW_ONE_OFF_SEED=true no ambiente.
    if (process.env.ALLOW_ONE_OFF_SEED !== 'true') {
      return NextResponse.json({ error: 'Rota desativada' }, { status: 410 });
    }

    const auth = req.headers.get('authorization') || '';
    const secret = process.env.NEXTAUTH_SECRET || '';
    if (!secret || auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const companies = await prisma.company.findMany({ select: { id: true, name: true } });
    if (companies.length === 0) {
      return NextResponse.json({ error: 'Nenhuma empresa encontrada no banco de dados' }, { status: 400 });
    }
    const company = companies[0];

    const existing = await prisma.user.findFirst({
      where: { email: { equals: 'alessandra@wticorp.com.br', mode: 'insensitive' } },
    });

    if (existing) {
      // Ensure UserCompany link exists
      const uc = await prisma.userCompany.findUnique({
        where: { userId_companyId: { userId: existing.id, companyId: company.id } },
      });
      if (!uc) {
        await prisma.userCompany.create({
          data: { userId: existing.id, companyId: company.id, role: 'FINANCE' },
        });
        return NextResponse.json({ ok: true, action: 'linked', user: existing.email, company: company.name });
      }
      return NextResponse.json({ ok: true, action: 'already_exists', user: existing.email, role: uc.role });
    }

    const hashedPassword = await bcrypt.hash('WTI@Aless@123', 12);

    const newUser = await prisma.user.create({
      data: {
        name: 'Alessandra',
        email: 'alessandra@wticorp.com.br',
        password: hashedPassword,
        hasPJ: true,
        hasPF: false,
        allowedEnvs: 'pj',
        defaultEnv: 'pj',
        activeCompanyId: company.id,
      },
    });

    await prisma.userCompany.create({
      data: { userId: newUser.id, companyId: company.id, role: 'FINANCE' },
    });

    return NextResponse.json({
      ok: true,
      action: 'created',
      user: { id: newUser.id, name: newUser.name, email: newUser.email },
      company: company.name,
      role: 'FINANCE',
    });
  } catch (err: any) {
    console.error('seed-alessandra error:', err);
    return NextResponse.json({ error: err?.message || 'Erro interno' }, { status: 500 });
  }
}
