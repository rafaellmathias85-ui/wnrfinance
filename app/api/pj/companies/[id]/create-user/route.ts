export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';

export async function POST(req: NextRequest, { params }: any) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const { id: companyId } = await params;

  // Only OWNER or ADMIN can create users
  const uc = await prisma.userCompany.findUnique({
    where: { userId_companyId: { userId: session.user.id, companyId } },
  });
  if (!uc || !['OWNER', 'ADMIN'].includes(uc.role)) {
    return NextResponse.json({ error: 'Sem permissão para criar usuários' }, { status: 403 });
  }

  const body = await req.json();
  const { name, email, password, role = 'VIEWER', hasPF = false, hasPJ = true } = body;

  const normalizedEmail = String(email || '').trim().toLowerCase();

  if (!normalizedEmail || !password || !name) {
    return NextResponse.json({ error: 'Nome, e-mail e senha são obrigatórios' }, { status: 400 });
  }
  if (String(password).length < 6) {
    return NextResponse.json({ error: 'A senha deve ter pelo menos 6 caracteres' }, { status: 400 });
  }

  const existing = await prisma.user.findFirst({
    where: { email: { equals: normalizedEmail, mode: 'insensitive' } },
  });
  if (existing) {
    return NextResponse.json({ error: 'Já existe um usuário com este e-mail' }, { status: 409 });
  }

  const hashedPassword = await bcrypt.hash(String(password), 12);

  // Determine allowedEnvs and defaultEnv
  let allowedEnvs = 'pf';
  if (hasPF && hasPJ) allowedEnvs = 'both';
  else if (hasPJ) allowedEnvs = 'pj';
  else if (hasPF) allowedEnvs = 'pf';

  const defaultEnv = hasPJ ? 'pj' : 'pf';

  const newUser = await prisma.user.create({
    data: {
      name: String(name).trim(),
      email: normalizedEmail,
      password: hashedPassword,
      hasPF: Boolean(hasPF),
      hasPJ: Boolean(hasPJ),
      allowedEnvs,
      defaultEnv,
      // Link active company if PJ access granted
      ...(hasPJ ? { activeCompanyId: companyId } : {}),
    },
  });

  // Link user to this company
  if (hasPJ) {
    await prisma.userCompany.create({
      data: { userId: newUser.id, companyId, role: String(role) },
    });
  }

  return NextResponse.json(
    { id: newUser.id, name: newUser.name, email: newUser.email, role: hasPJ ? role : null },
    { status: 201 },
  );
}
