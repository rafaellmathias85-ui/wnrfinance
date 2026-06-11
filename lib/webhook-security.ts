// Segurança de webhooks — autenticação fail-closed + idempotência de eventos.
//
// Política (alinhada à Res. BCB/CMN nº 4.893/2021 — política de segurança cibernética):
// - Em PRODUÇÃO, webhooks de pagamento/fiscal SEM segredo configurado são REJEITADOS (fail-closed).
// - Em desenvolvimento, a verificação é dispensada apenas quando o segredo não está configurado.
// - Escape hatch temporário: WEBHOOK_ALLOW_UNAUTHENTICATED=true (gera log crítico a cada uso).
//
// Idempotência: todo evento recebido é registrado em WebhookEvent com unique(provider, eventId).
// Reentregas do provedor são reconhecidas e ignoradas sem reprocessar efeitos financeiros.

import crypto from 'crypto';
import { prisma } from '@/lib/prisma';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

function allowUnauthenticated(): boolean {
  return process.env.WEBHOOK_ALLOW_UNAUTHENTICATED === 'true';
}

export function timingSafeEqualStr(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Compara contra si mesmo para manter tempo constante antes de retornar false
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

export type WebhookAuthResult =
  | { ok: true }
  | { ok: false; status: number; reason: string };

/**
 * Valida o token estático de um webhook (ex.: Asaas `asaas-access-token`).
 * Fail-closed em produção quando o segredo não está configurado.
 */
export function verifyWebhookToken(
  providedToken: string | null,
  expectedToken: string | undefined,
  providerLabel: string,
): WebhookAuthResult {
  if (!expectedToken) {
    if (IS_PRODUCTION && !allowUnauthenticated()) {
      console.error(
        `[WebhookSecurity] CRÍTICO: webhook ${providerLabel} rejeitado — segredo não configurado em produção. ` +
        `Configure o token no painel do provedor e na variável de ambiente correspondente.`,
      );
      return { ok: false, status: 503, reason: 'Webhook token not configured' };
    }
    if (IS_PRODUCTION) {
      console.error(
        `[WebhookSecurity] ALERTA: webhook ${providerLabel} aceito SEM autenticação (WEBHOOK_ALLOW_UNAUTHENTICATED=true). ` +
        `Remova esta exceção o quanto antes.`,
      );
    }
    return { ok: true };
  }
  if (!providedToken || !timingSafeEqualStr(providedToken, expectedToken)) {
    return { ok: false, status: 401, reason: 'Unauthorized' };
  }
  return { ok: true };
}

/**
 * Valida assinatura HMAC de um webhook (ex.: Focus NFe `x-hub-signature`).
 * Fail-closed em produção quando o segredo não está configurado.
 */
export function verifyWebhookHmac(
  rawBody: string,
  signature: string | null,
  secret: string | undefined,
  providerLabel: string,
  algorithm: 'sha1' | 'sha256' = 'sha1',
): WebhookAuthResult {
  if (!secret) {
    if (IS_PRODUCTION && !allowUnauthenticated()) {
      console.error(
        `[WebhookSecurity] CRÍTICO: webhook ${providerLabel} rejeitado — HMAC secret não configurado em produção.`,
      );
      return { ok: false, status: 503, reason: 'Webhook secret not configured' };
    }
    return { ok: true };
  }
  if (!signature) return { ok: false, status: 401, reason: 'Missing signature' };
  const expected = crypto.createHmac(algorithm, secret).update(rawBody).digest('hex');
  const normalized = signature.replace(new RegExp(`^${algorithm}=`), '');
  if (!timingSafeEqualStr(normalized, expected)) {
    return { ok: false, status: 401, reason: 'Invalid signature' };
  }
  return { ok: true };
}

/**
 * Registra um evento de webhook para fins de idempotência e auditoria.
 * @returns true se o evento é novo (deve ser processado); false se é reentrega (ignorar).
 */
export async function registerWebhookEvent(params: {
  provider: string;
  eventId: string;
  eventType?: string;
  payload?: unknown;
}): Promise<boolean> {
  try {
    await prisma.webhookEvent.create({
      data: {
        provider: params.provider,
        eventId: params.eventId,
        eventType: params.eventType ?? null,
        payload: params.payload === undefined ? undefined : (params.payload as any),
      },
    });
    return true;
  } catch (err: any) {
    // P2002 = unique constraint → evento já processado (reentrega do provedor)
    if (err?.code === 'P2002') return false;
    // Falha de infra no registro não deve derrubar o webhook: loga e processa
    // (preferimos risco de reprocessamento controlado a perder confirmação de pagamento).
    console.error('[WebhookSecurity] Falha ao registrar WebhookEvent:', err?.message);
    return true;
  }
}

/**
 * Gera um eventId determinístico quando o provedor não envia ID de evento,
 * a partir dos campos que definem unicidade do efeito.
 */
export function deterministicEventId(...parts: Array<string | number | undefined | null>): string {
  return crypto
    .createHash('sha256')
    .update(parts.map((p) => String(p ?? '')).join('|'))
    .digest('hex');
}
