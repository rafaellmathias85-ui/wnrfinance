export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';

// POST /api/pj/companies/[id]/users/[userId]
// Body: { action: 'reset-password' | 'block' | 'unblock' | 'force-mfa' | 'reset-mfa' }
// Requer role OWNER ou ADMIN na empresa
export async function POST(req: NextRequest, { params }: any) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const { id: companyId, userId: targetUserId } = await params;

  const callerUC = await prisma.userCompany.findUnique({
    where: { userId_companyId: { userId: session.user.id, companyId } },
  });
  if (!callerUC || !['OWNER', 'ADMIN'].includes(callerUC.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  }

  if (targetUserId === session.user.id) {
    return NextResponse.json({ error: 'Não é possível executar esta ação em si mesmo' }, { status: 400 });
  }

  const targetUC = await prisma.userCompany.findUnique({
    where: { userId_companyId: { userId: targetUserId, companyId } },
  });
  if (!targetUC) return NextResponse.json({ error: 'Usuário não encontrado nesta empresa' }, { status: 404 });

  if (callerUC.role === 'ADMIN' && targetUC.role === 'OWNER') {
    return NextResponse.json({ error: 'Administradores não podem gerenciar o proprietário' }, { status: 403 });
  }

  const user = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!user) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });

  const { action } = await req.json();

  switch (action) {
    case 'reset-password': {
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetTokenExpiry = new Date(Date.now() + 3_600_000);
      await prisma.user.update({ where: { id: targetUserId }, data: { resetToken, resetTokenExpiry } });

      const appUrl = process.env.NEXTAUTH_URL || 'https://wnrtecnologia.com.br/wnrfinance/app';
      const resetUrl = `${appUrl}/recuperar-senha?token=${resetToken}`;
      const htmlBody = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #3b82f6;">WNR Finance</h1>
          <p>Olá${user.name ? `, ${user.name}` : ''}!</p>
          <p>Um administrador solicitou a redefinição da sua senha. Clique no botão abaixo para criar uma nova senha:</p>
          <div style="text-align: center; margin: 24px 0;">
            <a href="${resetUrl}" style="background: #3b82f6; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: bold;">Redefinir Senha</a>
          </div>
          <p style="color: #6b7280; font-size: 13px;">O link expira em 1 hora. Se você não esperava este e-mail, entre em contato com o administrador.</p>
          <p style="color: #9ca3af; font-size: 12px;">Link direto: <a href="${resetUrl}">${resetUrl}</a></p>
        </div>`;
      try {
        await fetch('https://apps.abacus.ai/api/sendNotificationEmail', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            deployment_token: process.env.ABACUSAI_API_KEY,
            app_id: process.env.WEB_APP_ID,
            notification_id: process.env.NOTIF_ID_RECUPERAO_DE_SENHA,
            subject: 'Redefinição de Senha - WNR Finance',
            body: htmlBody,
            is_html: true,
            recipient_email: user.email,
            sender_alias: 'WNR Finance',
          }),
        });
      } catch { /* log silencioso */ }
      return NextResponse.json({ ok: true, message: 'E-mail de redefinição enviado' });
    }

    case 'block':
      await (prisma.user as any).update({ where: { id: targetUserId }, data: { isBlocked: true } });
      return NextResponse.json({ ok: true });

    case 'unblock':
      await (prisma.user as any).update({ where: { id: targetUserId }, data: { isBlocked: false } });
      return NextResponse.json({ ok: true });

    case 'force-mfa':
      await (prisma.user as any).update({ where: { id: targetUserId }, data: { mfaRequired: true } });
      return NextResponse.json({ ok: true });

    case 'reset-mfa':
      await (prisma.user as any).update({
        where: { id: targetUserId },
        data: { totpEnabled: false, totpSecret: null, backupCodes: null, mfaRequired: false },
      });
      return NextResponse.json({ ok: true });

    default:
      return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
  }
}
