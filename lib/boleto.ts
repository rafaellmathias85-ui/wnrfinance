// Boleto & PIX Cobrança Integration Layer
// Primary provider: Asaas (asaas.com) — supports both boleto and PIX
// Itaú PJ: native mTLS (https module) + OAuth2
// Uses CompanyConnection table for credentials

import https from 'https';
import fs from 'fs';
import { randomUUID } from 'crypto';
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
  nossoNumero?: number;   // Itaú: sequencial
  itauBoletoId?: string;  // Itaú: GUID da emissão
  providerKey?: string;   // which provider handled the charge
}

async function getChargeConnection(companyId: string) {
  return prisma.companyConnection.findFirst({
    where: { companyId, category: 'boleto', isActive: true, status: { not: 'erro' } },
    orderBy: { createdAt: 'desc' },
  });
}

async function getNextNossoNumero(companyId: string): Promise<number> {
  const last = await prisma.boletoCharge.findFirst({
    where: { companyId, nossoNumero: { not: null } },
    orderBy: { nossoNumero: 'desc' },
    select: { nossoNumero: true },
  });
  return (last?.nossoNumero ?? 0) + 1;
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
// Itaú PJ — Boleto Cobrança v2 (mTLS + OAuth2, Node.js https nativo)
// ─────────────────────────────────────────────────────────────────────────────
const ITAU_TOKEN_URL    = 'https://sts.itau.com.br/api/oauth/token';
const ITAU_EMIT_URL     = 'https://api.itau.com.br/cash_management/v2/boletos';
const ITAU_CONSULT_URL  = 'https://secure.api.cloud.itau.com.br/boletoscash/v2/boletos';

interface ItauBoletoConfig {
  clientId: string;
  clientSecret: string;
  certPath: string;
  keyPath: string;
  idBeneficiario: string;
}

function httpsRequest(
  urlStr: string,
  options: { method: string; agent: https.Agent; headers?: Record<string, string>; body?: string },
): Promise<any> {
  return new Promise((resolve, reject) => {
    const target = new URL(urlStr);
    const req = https.request(
      {
        method:   options.method,
        hostname: target.hostname,
        port:     target.port || undefined,
        path:     `${target.pathname}${target.search}`,
        headers:  options.headers,
        agent:    options.agent,
        timeout:  30_000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(Buffer.from(c)));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          if ((res.statusCode ?? 500) >= 400) {
            reject(new Error(`Itaú HTTP ${res.statusCode} [${target.pathname.split('/').slice(-2).join('/')}]: ${text.slice(0, 300)}`));
            return;
          }
          try { resolve(JSON.parse(text)); }
          catch { reject(new Error(`Itaú: JSON inválido na resposta — ${text.slice(0, 100)}`)); }
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Itaú: timeout (30 s)')); });
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function itauCreateCharge(
  payload: ChargePayload,
  companyId: string,
  cfg: ItauBoletoConfig,
): Promise<ChargeResult> {
  let cert: Buffer, key: Buffer;
  try {
    cert = fs.readFileSync(cfg.certPath);
    key  = fs.readFileSync(cfg.keyPath);
  } catch (err: any) {
    return { success: false, errorMessage: `Itaú: certificado não encontrado — ${err.message}` };
  }

  const agent = new https.Agent({ cert, key, rejectUnauthorized: true });

  // 1. OAuth2 token
  let token: string;
  try {
    const td = await httpsRequest(ITAU_TOKEN_URL, {
      method: 'POST',
      agent,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'x-itau-correlationID': randomUUID(),
        'x-itau-flowID': randomUUID(),
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
      }).toString(),
    });
    token = td.access_token;
  } catch (err: any) {
    return { success: false, errorMessage: `Itaú: falha ao obter token — ${err.message}` };
  }

  const authHeaders = () => ({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    'x-itau-apikey': cfg.clientId,
    'x-itau-correlationID': randomUUID(),
    'x-itau-flowID': randomUUID(),
  });

  // 2. nosso número sequencial
  const nossoNumero    = await getNextNossoNumero(companyId);
  const nossoNumeroStr = nossoNumero.toString().padStart(8, '0');

  const dueDate  = new Date(payload.dueDate).toISOString().slice(0, 10);
  const today    = new Date().toISOString().slice(0, 10);
  const valorStr = Math.round(payload.amount * 100).toString().padStart(17, '0');
  const docClean = payload.customerDoc.replace(/\D/g, '');
  const isCNPJ   = docClean.length > 11;

  const emitBody = {
    data: {
      etapa_processo_boleto: 'efetivacao',
      codigo_canal_operacao: 'API',
      beneficiario: { id_beneficiario: cfg.idBeneficiario },
      dado_boleto: {
        descricao_instrumento_cobranca: 'boleto',
        tipo_boleto: 'a vista',
        codigo_carteira: '109',
        codigo_especie: '01',
        valor_abatimento: '000',
        data_emissao: today,
        desconto_expresso: false,
        pagador: {
          pessoa: {
            nome_pessoa: payload.customerName.slice(0, 60),
            tipo_pessoa: isCNPJ
              ? { codigo_tipo_pessoa: 'J', numero_cadastro_pessoa_juridica: docClean }
              : { codigo_tipo_pessoa: 'F', numero_cadastro_pessoa_fisica: docClean },
          },
          endereco: {
            nome_logradouro: 'Endereço não informado',
            nome_bairro: 'N/A',
            nome_cidade: 'São Paulo',
            sigla_UF: 'SP',
            numero_CEP: '01310100',
          },
        },
        dados_individuais_boleto: [{
          numero_nosso_numero: nossoNumeroStr,
          data_vencimento: dueDate,
          valor_titulo: valorStr,
          texto_uso_beneficiario: '2',
          texto_seu_numero: (payload.externalId || nossoNumeroStr).slice(0, 10),
        }],
        ...(payload.instructions ? { mensagem_boleto: payload.instructions.slice(0, 200) } : {}),
      },
    },
  };

  // 3. Emite boleto
  let emitRes: any;
  try {
    emitRes = await httpsRequest(ITAU_EMIT_URL, {
      method: 'POST',
      agent,
      headers: authHeaders(),
      body: JSON.stringify(emitBody),
    });
  } catch (err: any) {
    return { success: false, errorMessage: `Itaú: erro na emissão — ${err.message}`, nossoNumero };
  }

  const emitido      = emitRes?.data?.dado_boleto?.dados_individuais_boleto?.[0];
  const itauBoletoId = emitRes?.data?.id_boleto || emitido?.id_boleto;
  const barcode      = emitido?.numero_linha_digitavel || emitido?.codigo_barras;
  let   boletoUrl: string | undefined = emitido?.url_boleto;

  // 4. Se não veio URL, tenta endpoint de consulta (best-effort)
  if (!boletoUrl) {
    try {
      const qs = new URLSearchParams({
        id_beneficiario: cfg.idBeneficiario,
        codigo_carteira: '109',
        nosso_numero: nossoNumeroStr,
      }).toString();
      const consultRes = await httpsRequest(`${ITAU_CONSULT_URL}?${qs}`, {
        method: 'GET',
        agent,
        headers: authHeaders(),
      });
      boletoUrl = consultRes?.data?.url_boleto || consultRes?.url_boleto;
    } catch { /* consulta é best-effort */ }
  }

  return {
    success: true,
    providerChargeId: itauBoletoId,
    providerKey: 'itau',
    boletoBarCode: barcode,
    boletoUrl: boletoUrl || undefined,
    nossoNumero,
    itauBoletoId,
    status: 'pendente',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main emission function
// ─────────────────────────────────────────────────────────────────────────────
export async function createCharge(companyId: string, payload: ChargePayload): Promise<ChargeResult> {
  const conn = await getChargeConnection(companyId);

  if (!conn) {
    // Fallback: Itaú via variáveis de ambiente (sem CompanyConnection configurada)
    const { ITAU_CLIENT_ID, ITAU_CLIENT_SECRET, ITAU_CERT_PATH, ITAU_KEY_PATH, ITAU_ID_BENEFICIARIO } = process.env;
    if (ITAU_CLIENT_ID && ITAU_CLIENT_SECRET && ITAU_CERT_PATH && ITAU_KEY_PATH && ITAU_ID_BENEFICIARIO) {
      return itauCreateCharge(payload, companyId, {
        clientId: ITAU_CLIENT_ID,
        clientSecret: ITAU_CLIENT_SECRET,
        certPath: ITAU_CERT_PATH,
        keyPath: ITAU_KEY_PATH,
        idBeneficiario: ITAU_ID_BENEFICIARIO,
      });
    }
    return { success: false, errorMessage: 'Nenhuma conexão de cobrança ativa. Configure em Conexões → Boleto/PIX.' };
  }

  const config = decryptConfig(conn.config as any);

  switch (conn.providerKey) {
    case 'asaas':
      return asaasCreateCharge(payload, config);
    case 'itau':
      return itauCreateCharge(payload, companyId, {
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        certPath: config.certPath,
        keyPath: config.keyPath,
        idBeneficiario: config.idBeneficiario,
      });
    default:
      return { success: false, errorMessage: `Provedor "${conn.providerKey}" não suportado` };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Resolve Itaú boleto PDF URL on-demand (fetches from boletoscash API)
// Saves to DB on success so subsequent calls skip the API round-trip.
// ─────────────────────────────────────────────────────────────────────────────
export async function resolveItauBoletoUrl(
  companyId: string,
  chargeId: string,
  nossoNumero: number,
): Promise<string | null> {
  const { ITAU_CLIENT_ID, ITAU_CLIENT_SECRET, ITAU_CERT_PATH, ITAU_KEY_PATH, ITAU_ID_BENEFICIARIO } = process.env;
  if (!ITAU_CLIENT_ID || !ITAU_CLIENT_SECRET || !ITAU_CERT_PATH || !ITAU_KEY_PATH || !ITAU_ID_BENEFICIARIO) return null;

  let cert: Buffer, key: Buffer;
  try {
    cert = fs.readFileSync(ITAU_CERT_PATH);
    key  = fs.readFileSync(ITAU_KEY_PATH);
  } catch { return null; }

  const agent = new https.Agent({ cert, key, rejectUnauthorized: true });

  let token: string;
  try {
    const td = await httpsRequest(ITAU_TOKEN_URL, {
      method: 'POST', agent,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'x-itau-correlationID': randomUUID(), 'x-itau-flowID': randomUUID() },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: ITAU_CLIENT_ID, client_secret: ITAU_CLIENT_SECRET }).toString(),
    });
    token = td.access_token;
  } catch { return null; }

  const nossoNumeroStr = nossoNumero.toString().padStart(8, '0');
  const qs = new URLSearchParams({ id_beneficiario: ITAU_ID_BENEFICIARIO, codigo_carteira: '109', nosso_numero: nossoNumeroStr }).toString();
  try {
    const res = await httpsRequest(`${ITAU_CONSULT_URL}?${qs}`, {
      method: 'GET', agent,
      headers: { 'Authorization': `Bearer ${token}`, 'x-itau-apikey': ITAU_CLIENT_ID, 'Content-Type': 'application/json', 'x-itau-correlationID': randomUUID(), 'x-itau-flowID': randomUUID() },
    });
    const url: string | undefined =
      res?.data?.url_boleto || res?.url_boleto || res?.data?.dados_individuais_boleto?.[0]?.url_boleto;
    if (url) {
      await prisma.boletoCharge.update({ where: { id: chargeId }, data: { boletoUrl: url } }).catch(() => {});
      return url;
    }
  } catch { /* consulta é best-effort */ }
  return null;
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
