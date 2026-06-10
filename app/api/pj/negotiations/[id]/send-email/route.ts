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

    const { id: clientId } = params;
    const body = await req.json();
    const { to, cc, subject, htmlBody, receivableId } = body;

    if (!to?.length) return NextResponse.json({ error: 'Destinatário obrigatório' }, { status: 400 });
    if (!subject) return NextResponse.json({ error: 'Assunto obrigatório' }, { status: 400 });

    const smtp = await prisma.smtpConfig.findFirst({
      where: { companyId, isDefault: true, isActive: true },
    });

    const toStr = Array.isArray(to) ? to.join(', ') : to;

    const ccStr = cc ? (Array.isArray(cc) ? cc.join(', ') : cc) : null;
    await prisma.emailQueue.create({
      data: {
        companyId,
        smtpConfigId: smtp?.id || null,
        to: ccStr ? `${toStr}; CC: ${ccStr}` : toStr,
        subject,
        htmlBody: htmlBody || '',
        contextType: 'debt_negotiation',
        contextId: clientId,
        priority: 2,
      },
    });

    await prisma.emailLog.create({
      data: {
        companyId,
        smtpConfigId: smtp?.id || null,
        to: toStr,
        subject,
        contextType: 'debt_negotiation',
        contextId: clientId,
        status: 'sent',
      },
    });

    // Record negotiation event
    await prisma.debtNegotiation.create({
      data: {
        companyId,
        clientId: clientId || null,
        receivableId: receivableId || null,
        userId: session.user.id,
        type: 'note',
        notes: `Email enviado para: ${toStr}. Assunto: ${subject}`,
        emailSentAt: new Date(),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('[negotiations/send-email POST]', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
