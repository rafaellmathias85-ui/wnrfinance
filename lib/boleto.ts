// Boleto & PIX Cobrança Integration Layer
// Primary provider: Asaas (asaas.com) — supports both boleto and PIX
// Fallback: Iugu, Gerencianet/EFÍ
// Uses CompanyConnection table for credentials

import { prisma } from '@/lib/prisma';
import { safeDecrypt } from '@/lib/encrypt';

function decryptConfig(config: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(config)) {
    if (key.endsWith('_masked')) continue;
    result[key] = typeof value === 'string' && value.length > 30
      ? (safeDecrypt(value) ?? value)
      : value;
  }
  return result;
}

export interface ChargePayload {
  type: 'boleto' | 'pix' | 'boleto_pix' | 'link'; // boleto_pix = both at once
  customerName: string;
  customerDoc: string;    // CPF or CNPJ
  customerEmail?: string;
  amount: number;
  dueDate: Date | string;
  description?: string;
  instructions?: string; // boleto instructions (max 3 lines)
  externalId?: string;   // your internal reference (receivableId)
  discountValue?: number;
  interestValue?: number;
  fineValue?: number;
  pixExpiresHours?: number; // default: 24h
}

export interface ChargeResult {
  success: boolean;
  providerChargeId?: string;
  boletoBarCode?: string;
  boletoUrl?: string;
  pixCopiaECola?: string;
  pixQrCodeUrl?: string;
  pixExpiresAt?: Date;
  status?: string;
  errorMessage?: string;
}

async function getChargeConnection(companyId: string) {
  return prisma.companyConnection.findFirst({
    where: { companyId, category: 'boleto', isActive: true, status: { not: 'erro' } },
    orderBy: { createdAt: 'desc' },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Asaas adapter (sandbox: https://sandbox.asaas.com/api/v3)
// ─────────────────────────────────────────────────────────────────────────────
async function asaasCreateCharge(payload: ChargePayload, config: any): Promise<ChargeResult> {
  const { apiKey, environment } = config;
  const baseUrl = environment === 'sandbox'
    ? 'https://sandbox.asaas.com/api/v3'
    : 'https://api.asaas.com/v3';

  // 1. Find or create customer
  let customerId: string | null = null;
  try {
    const searchRes = await fetch(`${baseUrl}/customers?cpfCnpj=${payload.customerDoc.replace(/\D/g, '')}`, {
      headers: { access_token: apiKey },
      signal: AbortSignal.timeout(30_000),
    });
    const searchData = await searchRes.json();
    if (searchData.data?.length > 0) {
      customerId = searchData.data[0].id;
    } else {
      const createRes = await fetch(`${baseUrl}/customers`, {
        method: 'POST',
        headers: { access_token: apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: payload.customerName,
          cpfCnpj: payload.customerDoc.replace(/\D/g, ''),
          email: payload.customerEmail,
        }),
        signal: AbortSignal.timeout(30_000),
      });
      const createData = await createRes.json();
      customerId = createData.id;
    }
  } catch (err: any) {
    return { success: false, errorMessage: 'Erro ao localizar/criar cliente: ' + err.message };
  }

  if (!customerId) return { success: false, errorMessage: 'Não foi possível obter ID do cliente' };

  // 2. Create charge
  const billingType = payload.type === 'pix'
    ? 'PIX'
    : payload.type === 'boleto_pix'
      ? 'BOLETO_PIX'
      : payload.type === 'link'
        ? 'UNDEFINED'
        : 'BOLETO';
  const dueDate = new Date(payload.dueDate).toISOString().slice(0, 10);

  const chargeBody: any = {
    customer: customerId,
    billingType,
    value: payload.amount,
    dueDate,
    description: payload.description || 'Cobrança WNR Finance',
    externalReference: payload.externalId,
  };

  if (payload.discountValue) chargeBody.discount = { value: payload.discountValue, type: 'FIXED' };
  if (payload.interestValue) chargeBody.interest = { value: payload.interestValue };
  if (payload.fineValue) chargeBody.fine = { value: payload.fineValue };
  if (payload.type === 'pix' || payload.type === 'boleto_pix') {
    const expiresHours = payload.pixExpiresHours ?? 24;
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + expiresHours);
    chargeBody.pixAddressKeyType = 'EVP';
  }
  if (payload.instructions && (payload.type === 'boleto' || payload.type === 'boleto_pix')) {
    chargeBody.bankSlipInstructions = payload.instructions.slice(0, 500);
  }

  try {
    const res = await fetch(`${baseUrl}/payments`, {
      method: 'POST',
      headers: { access_token: apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(chargeBody),
      signal: AbortSignal.timeout(30_000),
    });

    const data = await res.json();

    if (!res.ok || data.errors) {
      const msg = data.errors?.map((e: any) => e.description).join('; ') || data.message || JSON.stringify(data);
      return { success: false, errorMessage: msg };
    }

    const result: ChargeResult = {
      success: true,
      providerChargeId: data.id,
      status: data.status,
    };

    if (data.invoiceUrl || data.bankSlipUrl) result.boletoUrl = data.invoiceUrl || data.bankSlipUrl;
    if (data.nossoNumero || data.invoiceNumber) result.boletoBarCode = data.nossoNumero;

    // Fetch PIX QR code if applicable
    if (payload.type === 'pix' || payload.type === 'boleto_pix') {
      try {
        const pixRes = await fetch(`${baseUrl}/payments/${data.id}/pixQrCode`, {
          headers: { access_token: apiKey },
          signal: AbortSignal.timeout(15_000),
        });
        const pixData = await pixRes.json();
        result.pixCopiaECola = pixData.payload;
        result.pixQrCodeUrl = pixData.encodedImage ? `data:image/png;base64,${pixData.encodedImage}` : undefined;
        result.pixExpiresAt = pixData.expirationDate ? new Date(pixData.expirationDate) : undefined;
      } catch { /* PIX QR code fetch is best-effort */ }
    }

    return result;
  } catch (err: any) {
    return { success: false, errorMessage: err.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main emission function
// ─────────────────────────────────────────────────────────────────────────────
export async function createCharge(companyId: string, payload: ChargePayload): Promise<ChargeResult> {
  const conn = await getChargeConnection(companyId);

  if (!conn) {
    return { success: false, errorMessage: 'Nenhuma conexão de cobrança ativa. Configure em Conexões → Boleto/PIX.' };
  }

  const config = decryptConfig(conn.config as any);

  switch (conn.providerKey) {
    case 'asaas':
      return asaasCreateCharge(payload, config);
    default:
      return { success: false, errorMessage: `Provedor "${conn.providerKey}" não suportado` };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Cancel charge
// ─────────────────────────────────────────────────────────────────────────────
export async function cancelCharge(companyId: string, providerChargeId: string): Promise<{ success: boolean; errorMessage?: string }> {
  const conn = await getChargeConnection(companyId);
  if (!conn) return { success: false, errorMessage: 'Conexão não encontrada' };

  const config = decryptConfig(conn.config as any);

  if (conn.providerKey === 'asaas') {
    const { apiKey, environment } = config;
    const baseUrl = environment === 'sandbox' ? 'https://sandbox.asaas.com/api/v3' : 'https://api.asaas.com/v3';
    try {
      const res = await fetch(`${baseUrl}/payments/${providerChargeId}`, {
        method: 'DELETE',
        headers: { access_token: apiKey },
        signal: AbortSignal.timeout(30_000),
      });
      const data = await res.json();
      return res.ok ? { success: true } : { success: false, errorMessage: data.message };
    } catch (err: any) {
      return { success: false, errorMessage: err.message };
    }
  }

  return { success: false, errorMessage: 'Cancelamento não suportado' };
}

// ─────────────────────────────────────────────────────────────────────────────
// Webhook handler for Asaas payment confirmation
// ─────────────────────────────────────────────────────────────────────────────
export interface AsaasWebhookEvent {
  event: string; // PAYMENT_RECEIVED, PAYMENT_OVERDUE, PAYMENT_DELETED, etc.
  payment: {
    id: string;
    status: string;
    value: number;
    paymentDate?: string;
    externalReference?: string;
  };
}

export async function processAsaasWebhook(event: AsaasWebhookEvent): Promise<void> {
  const { payment } = event;

  // Localiza a cobrança pelo ID do provedor OU pelo externalReference (nosso BoletoCharge.id)
  const boleto = await prisma.boletoCharge.findFirst({
    where: {
      OR: [
        { providerChargeId: payment.id },
        ...(payment.externalReference ? [{ id: payment.externalReference }] : []),
      ],
    },
  });

  if (!boleto) return;

  if (event.event === 'PAYMENT_RECEIVED' || event.event === 'PAYMENT_CONFIRMED') {
    const paidAt = payment.paymentDate ? new Date(payment.paymentDate) : new Date();
    // Transação: baixa do boleto e do recebível são atômicas (sem furo de conciliação)
    await prisma.$transaction(async (trx) => {
      await trx.boletoCharge.update({
        where: { id: boleto.id },
        data: {
          status: 'pago',
          paidAt,
          paidAmount: payment.value,
        },
      });

      if (boleto.receivableId) {
        await trx.accountsReceivable.updateMany({
          where: { id: boleto.receivableId },
          data: {
            status: 'recebido',
            amountReceived: payment.value ?? boleto.amount,
            receivedAt: paidAt,
            billingStatus: 'QUITADA',
            boletoStatus: 'pago',
          },
        });
      }
    });

    // Tarifa de liquidação automática (se habilitada na conta) — fora da
    // transação: falha na tarifa não pode reverter a baixa do pagamento.
    try {
      const { registerSettlementFees } = await import('@/lib/bank-fees');
      await registerSettlementFees(boleto.companyId, boleto.id, paidAt);
    } catch { /* tarifa é best-effort */ }
  } else if (event.event === 'PAYMENT_OVERDUE') {
    // Não rebaixa cobrança já liquidada (eventos fora de ordem)
    await prisma.boletoCharge.updateMany({
      where: { id: boleto.id, status: { not: 'pago' } },
      data: { status: 'vencido' },
    });
  } else if (event.event === 'PAYMENT_DELETED' || event.event === 'PAYMENT_REFUNDED') {
    await prisma.boletoCharge.update({ where: { id: boleto.id }, data: { status: 'cancelado' } });
  }
}
