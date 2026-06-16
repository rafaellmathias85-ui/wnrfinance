export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { sendEmailWithConfig } from '@/lib/smtp';
import { resolveItauBoletoUrl } from '@/lib/boleto';

function fmtDate(d: string | Date | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('pt-BR');
}
function fmtCurrency(v: number | null | undefined) {
  return (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function buildHtmlBody(params: {
  customerName: string;
  description: string;
  dueDate: string | Date | null;
  amount: number;
  boletoUrl?: string | null;
  nfePdfUrl?: string | null;
  pixQrCodeUrl?: string | null;
  senderName: string;
}) {
  const { customerName, description, dueDate, amount, boletoUrl, nfePdfUrl, pixQrCodeUrl, senderName } = params;

  const rows = [
    { label: 'Vencimento', value: fmtDate(dueDate) },
    { label: 'Valor', value: fmtCurrency(amount) },
    { label: 'Serviços', value: description || '—' },
  ];
  if (boletoUrl) rows.push({ label: 'Boleto', value: `<a href="${boletoUrl}" style="color:#2563eb;">Clique aqui para visualizar</a>` });
  if (pixQrCodeUrl) rows.push({ label: 'Pix', value: `<a href="${pixQrCodeUrl}" style="color:#2563eb;">QR Code Pix</a>` });
  if (nfePdfUrl) rows.push({ label: 'Nota Fiscal', value: `<a href="${nfePdfUrl}" style="color:#2563eb;">Clique aqui para visualizar</a>` });

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08);">
        <tr><td style="background:#1e3a5f;padding:24px 32px;">
          <p style="margin:0;color:#fff;font-size:20px;font-weight:bold;">${senderName}</p>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="margin:0 0 16px;font-size:15px;color:#111;">Olá <strong>${customerName}</strong>,</p>
          <p style="margin:0 0 20px;font-size:14px;color:#444;">Este é um aviso automático referente à sua fatura:</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;margin-bottom:24px;">
            ${rows.map((r, i) => `<tr style="background:${i % 2 === 0 ? '#f9fafb' : '#ffffff'};">
              <td style="padding:10px 16px;font-size:13px;color:#6b7280;width:140px;border-bottom:1px solid #e5e7eb;"><strong>${r.label}</strong></td>
              <td style="padding:10px 16px;font-size:13px;color:#111;border-bottom:1px solid #e5e7eb;">${r.value}</td>
            </tr>`).join('')}
          </table>
          <p style="margin:0 0 8px;font-size:14px;color:#444;">Qualquer dúvida entre em contato.</p>
          <p style="margin:0;font-size:14px;color:#444;">Atenciosamente,<br><strong>${senderName}</strong></p>
        </td></tr>
        <tr><td style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;font-size:11px;color:#9ca3af;text-align:center;">Este é um e-mail automático. Por favor, não responda diretamente.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

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
    const { to, cc, subject, htmlBody, attachBoleto = true, attachNfe = true } = body;

    if (!to?.length) return NextResponse.json({ error: 'Destinatário obrigatório' }, { status: 400 });

    const smtp = await prisma.smtpConfig.findFirst({ where: { companyId, isDefault: true, isActive: true } });
    if (!smtp) return NextResponse.json({ error: 'SMTP não configurado. Acesse Configurações → E-mail SMTP.' }, { status: 422 });

    // Fetch NFS-e and boleto
    const [nfe, boleto] = await Promise.all([
      prisma.nFe.findFirst({ where: { receivableId: id, companyId }, orderBy: { createdAt: 'desc' } }),
      prisma.boletoCharge.findFirst({ where: { receivableId: id, companyId }, orderBy: { createdAt: 'desc' } }),
    ]);

    let boletoUrl = boleto?.boletoUrl || null;
    if (!boletoUrl && boleto?.nossoNumero && boleto?.providerKey === 'itau') {
      boletoUrl = await resolveItauBoletoUrl(companyId, boleto.id, boleto.nossoNumero);
    }
    const pixQrCodeUrl = boleto?.pixQrCodeUrl || null;
    const nfePdfUrl = nfe?.pdfUrl || null;

    // Build email content
    const finalSubject = subject || `Fatura — ${item.description || item.customerName}`;
    const finalHtml = htmlBody || buildHtmlBody({
      customerName: item.customerName || '',
      description: item.description || '',
      dueDate: item.dueDate,
      amount: Number(item.amount),
      boletoUrl,
      nfePdfUrl,
      pixQrCodeUrl,
      senderName: smtp.senderName || 'WNR Finance',
    });

    // Build attachments (PDF via URL — nodemailer downloads automatically)
    const attachments: Array<{ filename: string; path: string }> = [];
    if (attachBoleto && boletoUrl) {
      attachments.push({ filename: 'boleto.pdf', path: boletoUrl });
    }
    if (attachNfe && nfePdfUrl) {
      attachments.push({ filename: 'nota-fiscal.pdf', path: nfePdfUrl });
    }

    const toArr = Array.isArray(to) ? to : to.split(/[,;]/).map((s: string) => s.trim()).filter(Boolean);
    const ccArr = cc ? (Array.isArray(cc) ? cc : cc.split(/[,;]/).map((s: string) => s.trim()).filter(Boolean)) : [];
    const toStr = toArr.join(', ');

    // Send immediately
    const result = await sendEmailWithConfig(
      smtp.id,
      {
        to: toArr,
        ...(ccArr.length ? { replyTo: undefined } : {}),
        subject: finalSubject,
        html: finalHtml,
        attachments: attachments.length ? attachments : undefined,
      },
      'receivable',
      id,
    );

    if (!result.success) {
      // Log failure
      await prisma.emailLog.create({
        data: { companyId, smtpConfigId: smtp.id, to: toStr, subject: finalSubject, contextType: 'receivable', contextId: id, status: 'failed', errorMsg: result.error },
      }).catch(() => {});
      return NextResponse.json({ error: result.error || 'Falha ao enviar e-mail' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, sent: true });
  } catch (error: any) {
    console.error('[faturamento/[id]/send-email POST]', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
