export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { generateSecret, generateURI } from 'otplib';
import QRCode from 'qrcode';
import crypto from 'crypto';

function generateBackupCodes(count = 8): string[] {
  return Array.from({ length: count }, () =>
    crypto.randomBytes(4).toString('hex').toUpperCase()
  );
}

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (!user) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }
    if (user.totpEnabled) {
      return NextResponse.json({ error: 'MFA já está ativo' }, { status: 400 });
    }

    const secret = generateSecret();
    const backupCodes = generateBackupCodes();
    const otpauthUrl = generateURI({ issuer: 'WNR Finance', label: user.email, secret });
    const qrDataUrl = await QRCode.toDataURL(otpauthUrl);

    // Store secret and backup codes (not yet enabled)
    await prisma.user.update({
      where: { id: user.id },
      data: {
        totpSecret: secret,
        backupCodes: JSON.stringify(backupCodes),
      },
    });

    return NextResponse.json({ qrDataUrl, secret, backupCodes });
  } catch (error) {
    console.error('TOTP setup error:', error);
    return NextResponse.json({ error: 'Erro ao configurar MFA' }, { status: 500 });
  }
}
