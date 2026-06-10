export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    const companyId = (session.user as any).activeCompanyId as string;
    if (!companyId) return NextResponse.json({ error: 'Selecione uma empresa' }, { status: 400 });

    const { id } = params;
    const item = await prisma.accountsReceivable.findFirst({ where: { id, companyId } });
    if (!item) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

    const body = await req.json();
    const { to, cc, subject, htmlBody } = body;

    if (!to?.length) return NextResponse.json({ error: 'Destinatário obrigatório' }, { status: 400 });

    // Get default SMTP config
    const smtp = await prisma.smtpConfig.findFirst({
      where: { companyId, isDefault: true, isActive: true },
    });

    const toStr = Array.isArray(to) ? to.join(', ') : to;

    // Queue email
    await prisma.emailQueue.create({
      data: {
        companyId,
        smtpConfigId: smtp?.id || null,
        to: toStr,
        subject: subject || `Fatura — ${item.description}`,
        htmlBody: htmlBody || `<p>Segue sua fatura referente a: ${item.description}</p>`,
        contextType: 'receivable',
        contextId: id,
        priority: 3,
      },
    });

    // Log
    await prisma.emailLog.create({
      data: {
        companyId,
        smtpConfigId: smtp?.id || null,
        to: toStr,
        subject: subject || `Fatura — ${item.description}`,
        contextType: 'receivable',
        contextId: id,
        status: 'sent',
      },
    });

    return NextResponse.json({ ok: true, queued: true });
  } catch (error: any) {
    console.error('[faturamento/[id]/send-email POST]', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
