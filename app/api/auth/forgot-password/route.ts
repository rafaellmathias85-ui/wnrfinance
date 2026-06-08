import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';
import { rateLimitSync as rateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { email } = await request.json();
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail) {
      return NextResponse.json({ message: 'Se o e-mail existir, você receberá um link de recuperação.' });
    }

    const ip = request.headers.get('x-forwarded-for') || 'unknown';
    const rl = rateLimit(`forgot:${ip}`, { maxRequests: 3, windowMs: 600_000 });
    if (!rl.allowed) {
      return NextResponse.json({ message: 'Se o e-mail existir, você receberá um link de recuperação.' });
    }

    const user = await prisma.user.findFirst({
      where: { email: { equals: normalizedEmail, mode: 'insensitive' } },
    });
    // Always return same message to prevent email enumeration
    if (!user || !user.password) {
      return NextResponse.json({ message: 'Se o e-mail existir, você receberá um link de recuperação.' });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour

    await prisma.user.update({
      where: { id: user.id },
      data: { resetToken, resetTokenExpiry },
    });

    const appUrl = process.env.NEXTAUTH_URL || 'https://wnrfinance.abacusai.app';
    const resetUrl = `${appUrl}/recuperar-senha?token=${resetToken}`;

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #3b82f6; margin: 0;">WNR Finance</h1>
          <p style="color: #6b7280; font-size: 14px;">Recuperação de Senha</p>
        </div>
        <div style="background: #f9fafb; padding: 24px; border-radius: 12px; border: 1px solid #e5e7eb;">
          <p style="color: #374151; font-size: 16px;">Olá${user.name ? `, ${user.name}` : ''}!</p>
          <p style="color: #374151;">Recebemos uma solicitação para redefinir sua senha. Clique no botão abaixo para criar uma nova senha:</p>
          <div style="text-align: center; margin: 24px 0;">
            <a href="${resetUrl}" style="display: inline-block; background: #3b82f6; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: bold;">Redefinir Senha</a>
          </div>
          <p style="color: #6b7280; font-size: 13px;">Se você não solicitou essa alteração, ignore este e-mail. O link expira em 1 hora.</p>
          <p style="color: #9ca3af; font-size: 12px; margin-top: 16px;">Link direto: <a href="${resetUrl}" style="color: #3b82f6;">${resetUrl}</a></p>
        </div>
        <p style="text-align: center; color: #9ca3af; font-size: 11px; margin-top: 20px;">© WNR Finance • Winner Soluções em Tecnologia</p>
      </div>
    `;

    try {
      const appName = 'WNR Finance';
      await fetch('https://apps.abacus.ai/api/sendNotificationEmail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deployment_token: process.env.ABACUSAI_API_KEY,
          app_id: process.env.WEB_APP_ID,
          notification_id: process.env.NOTIF_ID_RECUPERAO_DE_SENHA,
          subject: 'Recuperação de Senha - WNR Finance',
          body: htmlBody,
          is_html: true,
          recipient_email: user.email,
          sender_alias: appName,
        }),
      });
    } catch (emailErr) {
      console.error('Erro ao enviar email:', emailErr);
    }

    return NextResponse.json({ message: 'Se o e-mail existir, você receberá um link de recuperação.' });
  } catch (error) {
    console.error('Forgot password error:', error);
    return NextResponse.json({ message: 'Se o e-mail existir, você receberá um link de recuperação.' });
  }
}
