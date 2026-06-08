export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';

const isAdmin = (session: any) => ['admin', 'master'].includes(session?.user?.role);

function envFlags(allowedEnvs: string) {
  return {
    hasPF: allowedEnvs === 'pf' || allowedEnvs === 'both',
    hasPJ: allowedEnvs === 'pj' || allowedEnvs === 'both',
  };
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (id) {
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true, name: true, email: true, role: true,
        hasPF: true, hasPJ: true, defaultEnv: true, allowedEnvs: true,
        activeCompanyId: true, createdAt: true, updatedAt: true, totpEnabled: true,
        subscription: { select: { plan: true, status: true } },
        companies: {
          include: {
            company: { select: { id: true, name: true, tradeName: true, cnpj: true } },
          },
        },
      },
    });
    if (!user) return NextResponse.json({ error: 'Usuario nao encontrado' }, { status: 404 });
    return NextResponse.json(user);
  }

  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, name: true, email: true, role: true,
      hasPF: true, hasPJ: true, defaultEnv: true, allowedEnvs: true,
      createdAt: true, totpEnabled: true,
      subscription: { select: { plan: true, status: true } },
    },
  });
  return NextResponse.json(users);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }
  const body = await req.json();
  const { name, email, password, role, allowedEnvs } = body;
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail || !password) return NextResponse.json({ error: 'Email e senha obrigatorios' }, { status: 400 });
  const exists = await prisma.user.findFirst({
    where: { email: { equals: normalizedEmail, mode: 'insensitive' } },
  });
  if (exists) return NextResponse.json({ error: 'Email ja cadastrado' }, { status: 400 });
  const hashed = await bcrypt.hash(password, 10);
  const normalizedEnvs = ['pf', 'pj', 'both'].includes(allowedEnvs) ? allowedEnvs : 'pf';
  const { hasPF, hasPJ } = envFlags(normalizedEnvs);
  const user = await prisma.user.create({
    data: {
      name: String(name || '').trim() || normalizedEmail.split('@')[0],
      email: normalizedEmail,
      password: hashed,
      role: role || 'user',
      allowedEnvs: normalizedEnvs,
      hasPF,
      hasPJ,
      defaultEnv: hasPJ ? 'pj' : 'pf',
    },
    select: { id: true, name: true, email: true, role: true, allowedEnvs: true },
  });
  return NextResponse.json(user, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('id');
  if (!userId) return NextResponse.json({ error: 'ID obrigatorio' }, { status: 400 });
  if (userId === (session as any)?.user?.id) return NextResponse.json({ error: 'Nao pode excluir a si mesmo' }, { status: 400 });
  await prisma.user.delete({ where: { id: userId } });
  return NextResponse.json({ success: true });
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }
  const body = await req.json();
  const { id, name, email, password, role, allowedEnvs, defaultEnv, totpEnabled } = body;
  if (!id) return NextResponse.json({ error: 'ID obrigatorio' }, { status: 400 });

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: 'Usuario nao encontrado' }, { status: 404 });

  const data: any = {};
  if (name !== undefined) data.name = String(name || '').trim() || null;
  if (email !== undefined) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail) return NextResponse.json({ error: 'Email obrigatorio' }, { status: 400 });
    const emailOwner = await prisma.user.findFirst({
      where: { email: { equals: normalizedEmail, mode: 'insensitive' } },
    });
    if (emailOwner && emailOwner.id !== id) {
      return NextResponse.json({ error: 'Email ja cadastrado' }, { status: 400 });
    }
    data.email = normalizedEmail;
  }
  if (password !== undefined && String(password).trim()) {
    const nextPassword = String(password);
    if (nextPassword.length < 6) return NextResponse.json({ error: 'Senha deve ter pelo menos 6 caracteres' }, { status: 400 });
    data.password = await bcrypt.hash(nextPassword, 10);
  }
  if (role) data.role = role;
  if (allowedEnvs) {
    const normalizedEnvs = ['pf', 'pj', 'both'].includes(allowedEnvs) ? allowedEnvs : 'pf';
    data.allowedEnvs = normalizedEnvs;
    Object.assign(data, envFlags(normalizedEnvs));
    if (defaultEnv && ((defaultEnv === 'pf' && data.hasPF) || (defaultEnv === 'pj' && data.hasPJ))) {
      data.defaultEnv = defaultEnv;
    } else if (existing.defaultEnv === 'pj' && !data.hasPJ) {
      data.defaultEnv = 'pf';
      data.activeCompanyId = null;
    } else if (existing.defaultEnv === 'pf' && !data.hasPF) {
      data.defaultEnv = 'pj';
    }
  } else if (defaultEnv) {
    if (defaultEnv === 'pf' && existing.hasPF) data.defaultEnv = 'pf';
    if (defaultEnv === 'pj' && existing.hasPJ) data.defaultEnv = 'pj';
  }
  if (totpEnabled === false) {
    data.totpEnabled = false;
    data.totpSecret = null;
    data.backupCodes = null;
  }
  const user = await prisma.user.update({ where: { id }, data });
  return NextResponse.json({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    allowedEnvs: user.allowedEnvs,
    defaultEnv: user.defaultEnv,
    hasPF: user.hasPF,
    hasPJ: user.hasPJ,
    totpEnabled: user.totpEnabled,
  });
}
