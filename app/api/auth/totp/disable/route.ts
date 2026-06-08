export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { verifySync } from 'otplib';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { code } = await req.json();
    if (!code || typeof code !== 'string') {
      return NextResponse.json({ error: 'Código obrigatório' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (!user?.totpSecret || !user.totpEnabled) {
      return NextResponse.json({ error: 'MFA não está ativo' }, { status: 400 });
    }

    // Check TOTP code or backup code
    const cleanCode = code.replace(/\s/g, '');
    const isTotp = verifySync({ token: cleanCode, secret: user.totpSecret }).valid;
    let isBackup = false;

    if (!isTotp && user.backupCodes) {
      const codes: string[] = JSON.parse(user.backupCodes);
      const idx = codes.indexOf(cleanCode.toUpperCase());
      if (idx !== -1) {
        isBackup = true;
        codes.splice(idx, 1);
        await prisma.user.update({
          where: { id: user.id },
          data: { backupCodes: JSON.stringify(codes) },
        });
      }
    }

    if (!isTotp && !isBackup) {
      return NextResponse.json({ error: 'Código inválido' }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { totpSecret: null, totpEnabled: false, backupCodes: null },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('TOTP disable error:', error);
    return NextResponse.json({ error: 'Erro ao desativar MFA' }, { status: 500 });
  }
}
