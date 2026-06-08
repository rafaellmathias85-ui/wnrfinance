export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { verifySync } from 'otplib';
import { rateLimitSync as rateLimit } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const rl = rateLimit(`totp-verify:${session.user.id}`, { maxRequests: 5, windowMs: 60_000 });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `Muitas tentativas. Tente novamente em ${Math.ceil(rl.retryAfterMs / 1000)}s` },
        { status: 429 }
      );
    }

    const { code } = await req.json();
    if (!code || typeof code !== 'string') {
      return NextResponse.json({ error: 'Código obrigatório' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (!user?.totpSecret) {
      return NextResponse.json({ error: 'MFA não configurado' }, { status: 400 });
    }

    const result = verifySync({ token: code.replace(/\s/g, ''), secret: user.totpSecret });
    if (!result.valid) {
      return NextResponse.json({ error: 'Código inválido' }, { status: 400 });
    }

    // Enable TOTP
    if (!user.totpEnabled) {
      await prisma.user.update({
        where: { id: user.id },
        data: { totpEnabled: true },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('TOTP verify error:', error);
    return NextResponse.json({ error: 'Erro ao verificar código' }, { status: 500 });
  }
}
