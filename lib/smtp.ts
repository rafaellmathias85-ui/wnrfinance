import nodemailer, { Transporter } from 'nodemailer';
import { encrypt, decrypt, safeDecrypt } from '@/lib/encrypt';
import { prisma } from '@/lib/db';

export type SmtpPreset = 'gmail' | 'outlook' | 'zoho' | 'locaweb' | 'hostinger' | 'custom';

export interface SmtpPresetConfig {
  host: string;
  port: number;
  encryption: 'ssl' | 'tls' | 'none';
  requiresAppPassword?: boolean;
  helpText?: string;
}

export const SMTP_PRESETS: Record<SmtpPreset, SmtpPresetConfig> = {
  gmail: {
    host: 'smtp.gmail.com',
    port: 465,
    encryption: 'ssl',
    requiresAppPassword: true,
    helpText:
      'Gmail requer senha de app (16 dígitos) quando a verificação em duas etapas está ativa. Acesse myaccount.google.com > Segurança > Senhas de app.',
  },
  outlook: {
    host: 'smtp.office365.com',
    port: 587,
    encryption: 'tls',
    helpText: 'Use seu e-mail e senha do Microsoft 365 / Outlook.',
  },
  zoho: {
    host: 'smtp.zoho.com',
    port: 587,
    encryption: 'tls',
    helpText: 'Use seu e-mail e senha da conta Zoho Mail.',
  },
  locaweb: {
    host: 'email.locaweb.com.br',
    port: 587,
    encryption: 'tls',
    helpText: 'Informe o e-mail e senha cadastrados no painel Locaweb.',
  },
  hostinger: {
    host: 'smtp.hostinger.com',
    port: 465,
    encryption: 'ssl',
    helpText: 'Use seu e-mail de domínio e senha cadastrados no hPanel.',
  },
  custom: {
    host: '',
    port: 587,
    encryption: 'tls',
    helpText: 'Configure manualmente host, porta e tipo de criptografia.',
  },
};

export function encryptPassword(password: string): string {
  return encrypt(password);
}

export function decryptPassword(encrypted: string): string {
  return decrypt(encrypted);
}


function buildTransporter(config: {
  host: string;
  port: number;
  encryption: string;
  senderEmail: string;
  password: string;
}): Transporter {
  const secure = config.encryption === 'ssl';
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure,
    auth: {
      user: config.senderEmail,
      pass: config.password,
    },
    tls: { rejectUnauthorized: false },
  });
}

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  attachments?: Array<{ filename: string; path?: string; content?: string; contentType?: string }>;
  replyTo?: string;
}

export async function sendEmailWithConfig(
  smtpConfigId: string,
  options: SendEmailOptions,
  contextType?: string,
  contextId?: string,
): Promise<{ success: boolean; error?: string }> {
  const config = await prisma.smtpConfig.findUnique({ where: { id: smtpConfigId } });
  if (!config || !config.isActive) return { success: false, error: 'Configuração SMTP não encontrada ou inativa' };

  const password = safeDecrypt(config.encryptedPass);
  if (!password) return { success: false, error: 'Erro ao descriptografar senha' };

  const transporter = buildTransporter({
    host: config.host,
    port: config.port,
    encryption: config.encryption,
    senderEmail: config.senderEmail,
    password,
  });

  try {
    await transporter.sendMail({
      from: `"${config.senderName}" <${config.senderEmail}>`,
      to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
      replyTo: options.replyTo,
      attachments: options.attachments,
    });

    await prisma.emailLog.create({
      data: {
        companyId: config.companyId,
        smtpConfigId: config.id,
        to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
        subject: options.subject,
        contextType,
        contextId,
        status: 'sent',
        sentAt: new Date(),
      },
    });

    return { success: true };
  } catch (err: any) {
    const errorMsg = err?.message || 'Erro desconhecido';

    await prisma.emailLog.create({
      data: {
        companyId: config.companyId,
        smtpConfigId: config.id,
        to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
        subject: options.subject,
        contextType,
        contextId,
        status: 'failed',
        errorMsg,
        sentAt: new Date(),
      },
    });

    return { success: false, error: errorMsg };
  }
}

export async function testSmtpConfig(
  host: string,
  port: number,
  encryption: string,
  senderEmail: string,
  password: string,
  senderName: string,
  testRecipient: string,
): Promise<{ success: boolean; error?: string }> {
  const transporter = buildTransporter({ host, port, encryption, senderEmail, password });

  try {
    await transporter.verify();
    await transporter.sendMail({
      from: `"${senderName}" <${senderEmail}>`,
      to: testRecipient,
      subject: 'Teste de configuração SMTP — WNR Finance',
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #1a1a2e;">✅ Configuração SMTP funcionando!</h2>
          <p>Este e-mail confirma que sua configuração SMTP está correta.</p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;">
          <p style="color: #6b7280; font-size: 12px;">WNR Finance — Sistema Financeiro</p>
        </div>
      `,
    });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Falha na conexão SMTP' };
  }
}

export async function getDefaultSmtpConfig(companyId: string) {
  return prisma.smtpConfig.findFirst({
    where: { companyId, isDefault: true, isActive: true },
  });
}

export async function enqueueEmail(
  companyId: string,
  smtpConfigId: string,
  options: SendEmailOptions & { contextType?: string; contextId?: string; priority?: number },
): Promise<void> {
  await prisma.emailQueue.create({
    data: {
      companyId,
      smtpConfigId,
      to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
      subject: options.subject,
      htmlBody: options.html,
      textBody: options.text,
      attachments: options.attachments ? (options.attachments as any) : undefined,
      contextType: options.contextType,
      contextId: options.contextId,
      priority: options.priority ?? 5,
      status: 'pending',
    },
  });
}

export async function processEmailQueue(companyId: string, limit = 10): Promise<void> {
  const items = await prisma.emailQueue.findMany({
    where: {
      companyId,
      status: 'pending',
      retries: { lt: prisma.emailQueue.fields.maxRetries as any },
      OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: new Date() } }],
    },
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    take: limit,
    include: { smtpConfig: true },
  });

  for (const item of items) {
    await prisma.emailQueue.update({ where: { id: item.id }, data: { status: 'processing' } });
    const config = item.smtpConfig;
    if (!config) {
      await prisma.emailQueue.update({
        where: { id: item.id },
        data: { status: 'failed', errorMsg: 'Configuração SMTP não encontrada' },
      });
      continue;
    }

    const password = safeDecrypt(config.encryptedPass);
    if (!password) {
      await prisma.emailQueue.update({
        where: { id: item.id },
        data: { status: 'failed', errorMsg: 'Erro ao descriptografar senha' },
      });
      continue;
    }

    const transporter = buildTransporter({
      host: config.host,
      port: config.port,
      encryption: config.encryption,
      senderEmail: config.senderEmail,
      password,
    });

    try {
      const to = item.to;
      await transporter.sendMail({
        from: `"${config.senderName}" <${config.senderEmail}>`,
        to,
        subject: item.subject,
        html: item.htmlBody || undefined,
        text: item.textBody || undefined,
      });
      await prisma.emailQueue.update({
        where: { id: item.id },
        data: { status: 'sent', sentAt: new Date() },
      });
      await prisma.emailLog.create({
        data: {
          companyId: item.companyId,
          smtpConfigId: config.id,
          to,
          subject: item.subject,
          contextType: item.contextType,
          contextId: item.contextId,
          status: 'sent',
          sentAt: new Date(),
        },
      });
    } catch (err: any) {
      const retries = item.retries + 1;
      const failed = retries >= item.maxRetries;
      const nextRetryAt = failed ? null : new Date(Date.now() + Math.pow(2, retries) * 60_000);
      await prisma.emailQueue.update({
        where: { id: item.id },
        data: {
          status: failed ? 'failed' : 'pending',
          retries,
          nextRetryAt,
          errorMsg: err?.message,
        },
      });
    }
  }
}
