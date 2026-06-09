// Sicoob (Bancoob) API connector
// Docs: https://developers.sicoob.com.br/
// Auth: OAuth2 client_credentials + mTLS certificate (required)
// Scopes: extrato_consulta saldo_consulta cobranca_boleto_inclusao

import { normalizeAPITransaction } from '../bank-transaction-normalizer';
import type {
  BankProvider,
  BankConnectionConfig,
  BankBalance,
  BankTransaction,
  BankChargeInput,
  BankChargeResult,
  BankChargeStatus,
} from '../bank-provider.interface';

const SICOOB_BASE = process.env.SICOOB_API_URL ?? 'https://api.sicoob.com.br';
const SICOOB_AUTH = process.env.SICOOB_AUTH_URL ?? 'https://auth.sicoob.com.br/auth/realms/cooperado/protocol/openid-connect/token';

async function getAccessToken(config: BankConnectionConfig): Promise<string> {
  if (config.accessToken) return config.accessToken;

  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: config.clientId!,
    client_secret: config.clientSecret!,
    scope: 'extrato_consulta saldo_consulta cobranca_boleto_inclusao',
  });

  const res = await fetch(SICOOB_AUTH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
    // Production: mTLS via Node https.Agent with cert+key
  });

  if (!res.ok) throw new Error(`Sicoob auth failed: ${res.status}`);
  const data = await res.json();
  return data.access_token;
}

async function sicoobFetch(
  path: string,
  config: BankConnectionConfig,
  options?: RequestInit,
): Promise<unknown> {
  const token = await getAccessToken(config);
  const res = await fetch(`${SICOOB_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      token_type: 'Bearer',
      ...(options?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Sicoob API error ${res.status}: ${err}`);
  }
  return res.json();
}

export class SicoobProvider implements BankProvider {
  readonly providerName = 'sicoob';

  async testConnection(config: BankConnectionConfig): Promise<boolean> {
    try { await getAccessToken(config); return true; } catch { return false; }
  }

  async getBalance(config: BankConnectionConfig): Promise<BankBalance> {
    const cooperativa = config.extra?.cooperativa ?? '';
    const conta = config.account;
    const data: any = await sicoobFetch(`/conta-corrente/v1/saldo?cooperativa=${cooperativa}&conta=${conta}`, config);
    return {
      available: Number(data.saldoDisponivel ?? data.saldo ?? 0),
      currency: 'BRL',
      asOf: new Date(),
    };
  }

  async getTransactions(
    config: BankConnectionConfig,
    startDate: string,
    endDate: string,
  ): Promise<BankTransaction[]> {
    const cooperativa = config.extra?.cooperativa ?? '';
    const conta = config.account;
    const params = new URLSearchParams({ cooperativa, conta, dataInicio: startDate, dataFim: endDate });
    const data: any = await sicoobFetch(`/conta-corrente/v1/extrato?${params}`, config);

    const rows: any[] = data.resultado ?? data.lancamentos ?? [];

    return rows.map(row => {
      const type: 'credit' | 'debit' = row.natureza === 'C' ? 'credit' : 'debit';
      return normalizeAPITransaction({
        bankCode: '756', // Sicoob COMPE
        agency: config.agency,
        account: config.account,
        externalId: row.identificacao ?? `sicoob_${row.data}_${row.valor}`,
        type,
        amount: Math.abs(Number(row.valor)),
        date: new Date(row.data),
        description: row.descricao ?? 'Lançamento Sicoob',
        documentNumber: row.documento,
        raw: row,
      });
    });
  }

  async createCharge(
    config: BankConnectionConfig,
    charge: BankChargeInput,
  ): Promise<BankChargeResult> {
    const cooperativa = config.extra?.cooperativa ?? '';
    const body = {
      cooperativa: Number(cooperativa),
      conta: Number(config.account),
      modalidade: 3,
      dataVencimento: charge.dueDate,
      valor: charge.amount,
      pagador: {
        cpfCnpj: charge.payerDocument.replace(/\D/g, ''),
        nome: charge.payerName,
      },
    };
    const data: any = await sicoobFetch('/cobranca-bancaria/v1/boletos', config, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return {
      chargeId: data.nossoNumero ?? data.id,
      barcode: data.linhaDigitavel,
      pdfUrl: data.linkBoleto,
      expiresAt: new Date(charge.dueDate + 'T23:59:59'),
    };
  }

  async getChargeStatus(
    config: BankConnectionConfig,
    chargeId: string,
  ): Promise<BankChargeStatus> {
    const data: any = await sicoobFetch(`/cobranca-bancaria/v1/boletos/${chargeId}`, config);
    const s = String(data.situacao ?? '').toUpperCase();
    const map: Record<string, BankChargeStatus> = {
      EMABERTO: 'pending', LIQUIDADO: 'paid', BAIXADO: 'cancelled', VENCIDO: 'overdue',
    };
    return map[s] ?? 'pending';
  }

  async refreshToken(config: BankConnectionConfig): Promise<{ accessToken: string; expiresIn: number }> {
    const params = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: config.clientId!,
      client_secret: config.clientSecret!,
    });
    const res = await fetch(SICOOB_AUTH, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString() });
    if (!res.ok) throw new Error('Sicoob token refresh failed');
    const data = await res.json();
    return { accessToken: data.access_token, expiresIn: data.expires_in };
  }
}

export const sicoobProvider = new SicoobProvider();
