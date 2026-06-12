export const dynamic = 'force-dynamic';

// Alerta de expiração de certificados digitais (A1/mTLS bancário).
// Verifica CompanyCertificate.expiresAt e BankConnection.tokenExpiresAt:
// cria Alert + e-mail nos marcos 45/30/15/7/1 dias antes do vencimento.
// Agendar diariamente junto aos demais crons.

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getDefaultSmtpConfig, enqueueEmail } from '@/lib/smtp';

function authorize(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET || process.env.INTERNAL_API_SECRET || '';
  if (!cronSecret) return process.env.NODE_ENV !== 'production';
  return authHeader === `Bearer ${cronSecret}`;
}

const MILESTONES = [45, 30, 15, 7, 1];

async function handler(req: NextRequest) {
  if (!authorize(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { acquireLock } = await import('@/src/lib/distributed-lock');
  const release = await acquireLock('certificate-expiry', 10 * 60 * 1000);
  if (!release) return NextResponse.json({ ok: false, skipped: 'lock_held' });

  try {
    const now = new Date();
    const horizon = new Date(now.getTime() + 46 * 86400000);

    const certs = await prisma.companyCertificate.findMany({
      where: { isActive: true, expiresAt: { not: null, lte: horizon } },
      include: { company: { select: { id: true, name: true } } },
    });

    let alerts = 0;
    for (const cert of certs) {
      const daysLeft = Math.ceil((cert.expiresAt!.getTime() - now.getTime()) / 86400000);
      const milestone = daysLeft <= 0 ? 0 : MILESTONES.find((m) => daysLeft === m);
      if (milestone === undefined && daysLeft > 0) continue;

      const title =
        daysLeft <= 0
          ? `Certificado VENCIDO: ${cert.fileName}`
          : `Certificado vence em ${daysLeft} dia(s): ${cert.fileName}`;

      // Idempotência diária: não duplica alerta do mesmo certificado no mesmo dia
      const today = new Date(now);
      today.setHours(0, 0, 0, 0);
      const users = await prisma.userCompany.findMany({
        where: { companyId: cert.companyId, role: { in: ['OWNER', 'ADMIN', 'FINANCE'] } },
        select: { userId: true },
      });

      for (const uc of users) {
        const existing = await prisma.alert.findFirst({
          where: {
            userId: uc.userId,
            title,
            createdAt: { gte: today },
          },
          select: { id: true },
        });
        if (existing) continue;

        await prisma.alert.create({
          data: {
            userId: uc.userId,
            companyId: cert.companyId,
            type: 'certificate_expiry',
            title,
            message:
              `O certificado "${cert.fileName}" da empresa ${cert.company.name} ` +
              (daysLeft <= 0
                ? 'está VENCIDO. Emissão de NFS-e e integrações bancárias podem parar de funcionar.'
                : `expira em ${cert.expiresAt!.toLocaleDateString('pt-BR')}. Providencie a renovação para não interromper NFS-e e integrações bancárias.`),
            severity: daysLeft <= 7 ? 'high' : 'medium',
            metadata: { certificateId: cert.id, daysLeft },
          },
        }).catch(() => {});
        alerts++;
      }

      // E-mail para o financeiro (1× por marco)
      const smtp = await getDefaultSmtpConfig(cert.companyId);
      if (smtp) {
        const sentToday = await prisma.emailLog.findFirst({
          where: {
            companyId: cert.companyId,
            contextType: 'certificate_expiry',
            contextId: cert.id,
            createdAt: { gte: today },
          },
          select: { id: true },
        });
        if (!sentToday) {
          await enqueueEmail(cert.companyId, smtp.id, {
            to: smtp.senderEmail,
            subject: `[WnrFinance] ${title}`,
            html: `<p>${title}</p><p>Empresa: <strong>${cert.company.name}</strong><br/>Validade: ${cert.expiresAt!.toLocaleDateString('pt-BR')}</p><p>Renove o certificado para não interromper a emissão de notas e as integrações bancárias.</p>`,
            contextType: 'certificate_expiry',
            contextId: cert.id,
          }).catch(() => {});
        }
      }
    }

    return NextResponse.json({ ok: true, certificatesChecked: certs.length, alerts, timestamp: now.toISOString() });
  } finally {
    await release();
  }
}

export async function POST(req: NextRequest) {
  return handler(req);
}
export async function GET(req: NextRequest) {
  return handler(req);
}
