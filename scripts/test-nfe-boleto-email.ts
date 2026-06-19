/**
 * Teste de integração: NFS-e + Boleto Itaú + Envio de E-mail
 *
 * Usa runReceivableAutomation (caminho real de produção) + sendEmailWithConfig.
 * Requer: empresa com ServiceFiscalRule + conexão NFS-e + conexão Itaú + SMTP.
 *
 * Uso: npx tsx scripts/test-nfe-boleto-email.ts
 */

import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';

// tsx resolve @/* via tsconfig.json paths
import { runReceivableAutomation } from '@/lib/receivable-automation';
import { sendEmailWithConfig }     from '@/lib/smtp';

const prisma = new PrismaClient();

// ─── Configuração ─────────────────────────────────────────────────────────────

const COMPANY_ID     = 'cmpljtfg30000ztogxxsyzmxv'; // Winner Soluções em TI
const USER_ID        = 'cmplakr7e0000ztngbpx5ms02'; // Rafael Lombardi
const CUSTOMER_EMAIL = 'rafaellmathias85@gmail.com';
const CUSTOMER_NAME  = 'Rafael Lombardi';
const CUSTOMER_CPF   = '05221282461';
const AMOUNT         = 100.00;
const DUE_DATE       = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // +7 dias

// ─── Helpers ─────────────────────────────────────────────────────────────────

function log(emoji: string, msg: string, detail?: any) {
  const ts = new Date().toISOString().slice(11, 19);
  if (detail !== undefined) {
    console.log(`${emoji} [${ts}]  ${msg}`, typeof detail === 'object' ? JSON.stringify(detail, null, 2) : detail);
  } else {
    console.log(`${emoji} [${ts}]  ${msg}`);
  }
}

function fmtBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n' + '═'.repeat(62));
  console.log('  TESTE COMPLETO: NFS-e + Boleto Itaú + E-mail');
  console.log('  Empresa:      Winner Soluções em Tecnologia');
  console.log(`  Destinatário: ${CUSTOMER_EMAIL}`);
  console.log(`  Valor:        ${fmtBRL(AMOUNT)}  |  Vencimento: ${DUE_DATE.toLocaleDateString('pt-BR')}`);
  console.log('═'.repeat(62) + '\n');

  // ─── 1. Busca regra fiscal padrão da empresa ───────────────────────────────
  log('📋', 'Buscando ServiceFiscalRule da empresa...');
  const fiscalRule = await prisma.serviceFiscalRule.findFirst({
    where: { companyId: COMPANY_ID, isActive: true },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
  });

  if (!fiscalRule) {
    log('⚠️', 'Nenhuma regra fiscal encontrada — NFS-e será emitida sem regra (pode falhar).');
  } else {
    log('✅', `Regra fiscal: "${fiscalRule.name}" | LC116=${fiscalRule.serviceCodeLc116} | ISS=${fiscalRule.issRate}%`);
  }

  // ─── 2. Cria AccountsReceivable ───────────────────────────────────────────
  log('📄', 'Criando AccountsReceivable...');
  const receivable = await prisma.accountsReceivable.create({
    data: {
      companyId:     COMPANY_ID,
      description:   `Teste de Integração — ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}`,
      customerName:  CUSTOMER_NAME,
      customerDoc:   CUSTOMER_CPF,
      customerEmail: CUSTOMER_EMAIL,
      amount:        AMOUNT,
      dueDate:       DUE_DATE,
      status:        'pendente',
      billingStatus: 'PREVISTA',
      autoNfe:       !!fiscalRule,
      autoBoleto:    true,
      chargeType:    'boleto',
      fiscalRuleId:  fiscalRule?.id ?? null,
      createdBy:     USER_ID,
    },
  });
  log('✅', `Recebível criado: ${receivable.id}`);

  // ─── 3. Automation: NFS-e + Boleto ────────────────────────────────────────
  console.log('\n' + '─'.repeat(50));
  log('🤖', 'Executando runReceivableAutomation (NFS-e + Boleto)...');

  const automation = await runReceivableAutomation(receivable.id, COMPANY_ID, {
    nfe:    !!fiscalRule,
    boleto: true,
  });

  console.log('');
  if (automation.nfe) {
    const icon = automation.nfe.status === 'autorizada' ? '✅'
               : automation.nfe.status === 'enviada'    ? '🕐'
               : automation.nfe.status === 'bloqueada'  ? '⛔'
               : '❌';
    log(icon, `NFS-e: status=${automation.nfe.status}${automation.nfe.id ? ' id=' + automation.nfe.id : ''}`);
    if (automation.nfe.errorMessage) log('   ⚠️', `  Motivo: ${automation.nfe.errorMessage.slice(0, 120)}`);
  }

  if (automation.boleto) {
    const icon = automation.boleto.status === 'pendente' || automation.boleto.status === 'ativo' ? '✅'
               : automation.boleto.status === 'bloqueada' ? '⛔'
               : '❌';
    log(icon, `Boleto: status=${automation.boleto.status}${automation.boleto.id ? ' id=' + automation.boleto.id : ''}`);
    if (automation.boleto.errorMessage) log('   ⚠️', `  Motivo: ${automation.boleto.errorMessage.slice(0, 120)}`);
  }

  // Recarrega registros para pegar URLs geradas
  const [nfeRecord, boletoRecord] = await Promise.all([
    automation.nfe?.id
      ? prisma.nFe.findUnique({ where: { id: automation.nfe.id }, select: { pdfUrl: true, status: true, errorMessage: true } })
      : null,
    prisma.boletoCharge.findFirst({
      where: { receivableId: receivable.id },
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true, boletoUrl: true, boletoBarCode: true, nossoNumero: true, errorMessage: true },
    }),
  ]);

  if (boletoRecord?.nossoNumero) log('🔢', `  nossoNumero=${boletoRecord.nossoNumero}`);
  if (boletoRecord?.boletoBarCode) log('📊', `  barcode=${boletoRecord.boletoBarCode.slice(0, 45)}...`);
  if (boletoRecord?.boletoUrl) log('🔗', `  PDF boleto: ${boletoRecord.boletoUrl}`);
  if (nfeRecord?.pdfUrl) log('🔗', `  PDF NFS-e:  ${nfeRecord.pdfUrl}`);

  // ─── 4. E-mail ────────────────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(50));
  log('📧', 'Enviando e-mail com boleto e NFS-e...');

  const smtp = await prisma.smtpConfig.findFirst({
    where: { companyId: COMPANY_ID, isDefault: true, isActive: true },
  });

  if (!smtp) {
    log('❌', 'Nenhuma configuração SMTP ativa — e-mail não enviado');
  } else {
    const dueStr = DUE_DATE.toLocaleDateString('pt-BR');
    const amtStr = fmtBRL(AMOUNT);

    const rows = [
      { label: 'Vencimento', value: dueStr },
      { label: 'Valor',      value: amtStr },
      { label: 'Serviço',    value: receivable.description },
      ...(boletoRecord?.boletoUrl
        ? [{ label: 'Boleto', value: `<a href="${boletoRecord.boletoUrl}" style="color:#2563eb">Clique para visualizar</a>` }]
        : boletoRecord?.boletoBarCode
        ? [{ label: 'Linha Digitável', value: `<code>${boletoRecord.boletoBarCode}</code>` }]
        : []),
      ...(nfeRecord?.pdfUrl
        ? [{ label: 'Nota Fiscal', value: `<a href="${nfeRecord.pdfUrl}" style="color:#2563eb">Clique para visualizar</a>` }]
        : automation.nfe
        ? [{ label: 'NFS-e', value: `Processando (${automation.nfe.status})` }]
        : []),
    ];

    const trackingToken = randomUUID();
    const baseUrl = (process.env.NEXTAUTH_URL || '').replace(/\/$/, '');
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';
    const pixelUrl = `${baseUrl}${basePath}/api/tracking/pixel/${trackingToken}`;

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;">
<table width="100%" style="background:#f3f4f6;padding:32px 0;"><tr><td align="center">
  <table width="600" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08);">
    <tr><td style="background:#1e3a5f;padding:24px 32px;">
      <p style="margin:0;color:#fff;font-size:20px;font-weight:bold;">Winner Soluções em Tecnologia</p>
    </td></tr>
    <tr><td style="padding:32px;">
      <p style="margin:0 0 16px;font-size:15px;color:#111;">Olá <strong>${CUSTOMER_NAME}</strong>,</p>
      <p style="margin:0 0 20px;font-size:14px;color:#444;">Sua fatura foi gerada com os dados abaixo:</p>
      <table width="100%" style="border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;margin-bottom:24px;">
        ${rows.map((r, i) => `
        <tr style="background:${i % 2 === 0 ? '#f9fafb' : '#fff'};">
          <td style="padding:10px 16px;font-size:13px;color:#6b7280;width:140px;border-bottom:1px solid #e5e7eb;"><strong>${r.label}</strong></td>
          <td style="padding:10px 16px;font-size:13px;color:#111;border-bottom:1px solid #e5e7eb;">${r.value}</td>
        </tr>`).join('')}
      </table>
      <p style="margin:0;font-size:14px;color:#444;">Qualquer dúvida, entre em contato.</p>
    </td></tr>
    <tr><td style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb;">
      <p style="margin:0;font-size:11px;color:#9ca3af;text-align:center;">E-mail automático de teste — WNR Finance</p>
    </td></tr>
  </table>
</td></tr></table>
<img src="${pixelUrl}" width="1" height="1" alt="" style="display:none;" />
</body></html>`;

    const attachments: { filename: string; path: string }[] = [];
    if (boletoRecord?.boletoUrl) attachments.push({ filename: 'boleto.pdf', path: boletoRecord.boletoUrl });
    if (nfeRecord?.pdfUrl) attachments.push({ filename: 'nota-fiscal.pdf', path: nfeRecord.pdfUrl });

    const emailResult = await sendEmailWithConfig(
      smtp.id,
      {
        to: CUSTOMER_EMAIL,
        subject: `[TESTE] Fatura — vencimento ${dueStr} — ${amtStr}`,
        html,
        attachments: attachments.length ? attachments : undefined,
      },
      'receivable',
      receivable.id,
      trackingToken,
    );

    if (emailResult.success) {
      log('✅', `E-mail enviado para ${CUSTOMER_EMAIL}` + (attachments.length ? ` (${attachments.length} anexo${attachments.length > 1 ? 's' : ''})` : ''));
    } else {
      log('❌', `Falha no e-mail: ${emailResult.error}`);
    }
  }

  // ─── Resumo ────────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(62));
  console.log('  RESULTADO');
  console.log('═'.repeat(62));
  console.log(`  Recebível : ${receivable.id}`);
  console.log(`  NFS-e     : ${automation.nfe?.status ?? '—'}${automation.nfe?.errorMessage ? ' ⚠️  ' + automation.nfe.errorMessage.slice(0, 60) : ''}`);
  console.log(`  Boleto    : ${automation.boleto?.status ?? '—'}${boletoRecord?.nossoNumero ? ' (nossoNum=' + boletoRecord.nossoNumero + ')' : ''}${automation.boleto?.errorMessage ? ' ⚠️  ' + automation.boleto.errorMessage.slice(0, 60) : ''}`);
  console.log(`  E-mail    : ${CUSTOMER_EMAIL}`);
  if (boletoRecord?.boletoUrl) console.log(`  PDF Bol.  : ${boletoRecord.boletoUrl}`);
  if (nfeRecord?.pdfUrl)       console.log(`  PDF NFS-e : ${nfeRecord.pdfUrl}`);
  console.log('═'.repeat(62) + '\n');
}

main()
  .catch(err => { console.error('ERRO FATAL:', err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
