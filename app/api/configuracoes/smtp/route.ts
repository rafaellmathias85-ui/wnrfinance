import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { encryptPassword } from '@/lib/smtp';
import { safeDecrypt, maskSecret } from '@/lib/encrypt';

export const dynamic = 'force-dynamic';

function sanitize(config: any, showMasked = true) {
  return {
    ...config,
    encryptedPass: undefined,
    maskedPass: showMasked ? maskSecret(safeDecrypt(config.encryptedPass) || '') : undefined,
  };
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const companyId = (session.user as any).activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Empresa não selecionada' }, { status: 400 });

  const items = await prisma.smtpConfig.findMany({
    where: { companyId },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
  });
  return NextResponse.json({ items: (items as any[]).map((i: any) => sanitize(i)) });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const companyId = (session.user as any).activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Empresa não selecionada' }, { status: 400 });

  const body = await req.json();
  if (!body.senderEmail || !body.host || !body.password) {
    return NextResponse.json({ error: 'E-mail, host e senha são obrigatórios' }, { status: 400 });
  }

  if (body.isDefault) {
    await prisma.smtpConfig.updateMany({ where: { companyId }, data: { isDefault: false } });
  }

  const existing = await prisma.smtpConfig.findFirst({ where: { companyId } });

  const item = await prisma.smtpConfig.create({
    data: {
      companyId,
      name: body.name || body.preset || 'Principal',
      preset: body.preset || 'custom',
      senderName: body.senderName || body.senderEmail,
      senderEmail: body.senderEmail,
      host: body.host,
      port: Number(body.port) || 587,
      encryption: body.encryption || 'tls',
      encryptedPass: encryptPassword(body.password),
      isDefault: body.isDefault ?? !existing,
      isActive: true,
    },
  });
  return NextResponse.json({ item: sanitize(item) }, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const companyId = (session.user as any).activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Empresa não selecionada' }, { status: 400 });

  const body = await req.json();
  if (!body.id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 });

  const existing = await prisma.smtpConfig.findFirst({ where: { id: body.id, companyId } });
  if (!existing) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

  if (body.isDefault) {
    await prisma.smtpConfig.updateMany({ where: { companyId, id: { not: body.id } }, data: { isDefault: false } });
  }

  const data: any = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.preset !== undefined) data.preset = body.preset;
  if (body.senderName !== undefined) data.senderName = body.senderName;
  if (body.senderEmail !== undefined) data.senderEmail = body.senderEmail;
  if (body.host !== undefined) data.host = body.host;
  if (body.port !== undefined) data.port = Number(body.port);
  if (body.encryption !== undefined) data.encryption = body.encryption;
  if (body.password) data.encryptedPass = encryptPassword(body.password);
  if (body.isDefault !== undefined) data.isDefault = body.isDefault;
  if (body.isActive !== undefined) data.isActive = body.isActive;

  const item = await prisma.smtpConfig.update({ where: { id: body.id }, data });
  return NextResponse.json({ item: sanitize(item) });
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const companyId = (session.user as any).activeCompanyId;
  if (!companyId) return NextResponse.json({ error: 'Empresa não selecionada' }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 });

  const existing = await prisma.smtpConfig.findFirst({ where: { id, companyId } });
  if (!existing) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

  await prisma.smtpConfig.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
