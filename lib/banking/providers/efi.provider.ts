// Efí (formerly Gerencianet) API connector
// Docs: https://dev.efipay.com.br/
// Auth: OAuth2 client_credentials + certificate for Pix
// BANK_CODE: 364

import { normalizeAPITransaction } from '../bank-transaction-normalizer';
import type { BankProvider, BankConnectionConfig, BankBalance, BankTransaction, BankChargeInput, BankChargeResult, BankChargeStatus } from '../bank-provider.interface';

const EFI_BASE = process.env.EFI_API_URL ?? 'https://sandbox.efipay.com.br';
const EFI_AUTH = `${EFI_BASE}/v1/authorize`;

async function getAccessToken(config: BankConnectionConfig): Promise<string> {
  if (config.accessToken) return config.accessToken;

  const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
  const res = await fetch(EFI_AUTH, {
    method: 'POST',
    headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ grant_type: 'client_credentials' }),
  });
  if (!res.ok) throw new Error(`Efí auth failed: ${res.status}`);
  const data = await res.json();
  return data.access_token;
}

async function efiFetch(path: string, config: BankConnectionConfig, options?: RequestInit): Promise<unknown> {
  const token = await getAccessToken(config);
  const res = await fetch(`${EFI_BASE}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(options?.headers ?? {}) },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Efí API error ${res.status}: ${err}`);
  }
  return res.json();
}

export class EfiProvider implements BankProvider {
  readonly providerName = 'efi';

  async testConnection(config: BankConnectionConfig): Promise<boolean> {
    try { await getAccessToken(config); return true; } catch { return false; }
  }

  async getBalance(config: BankConnectionConfig): Promise<BankBalance> {
    // Efí exposes saldo via extrato endpoint header
    const data: any = await efiFetch('/v1/extrato/saldo', config);
    return { available: Number(data.saldo ?? 0), currency: 'BRL', asOf: new Date() };
  }

  async getTransactions(config: BankConnectionConfig, startDate: string, endDate: string): Promise<BankTransaction[]> {
    const params = new URLSearchParams({ dataInicial: startDate, dataFinal: endDate });
    const data: any = await efiFetch(`/v1/extrato?${params}`, config);
    return (data.movimentos ?? []).map((row: any) =>
      normalizeAPITransaction({
        bankCode: '364',
        account: config.account,
        externalId: row.id ?? `efi_${row.data}_${row.valor}`,
        type: row.tipo === 'c' || row.tipo === 'credito' ? 'credit' : 'debit',
        amount: Math.abs(Number(row.valor)),
        date: new Date(row.data),
        description: row.descricao ?? 'Movimentação Efí',
        raw: row,
      }),
    );
  }

  async createCharge(config: BankConnectionConfig, charge: BankChargeInput): Promise<BankChargeResult> {
    const body = {
      items: [{ name: charge.description ?? 'Cobrança', value: Math.round(charge.amount * 100), amount: 1 }],
      customer: { name: charge.payerName, cpf: charge.payerDocument.replace(/\D/g, '').slice(0, 11) },
      expire_at: charge.dueDate,
      settings: { payment_method: 'banking_billet' },
    };
    const data: any = await efiFetch('/v1/charge', config, { method: 'POST', body: JSON.stringify(body) });
    return {
      chargeId: String(data.data?.charge_id ?? ''),
      barcode: data.data?.barcode,
      pdfUrl: data.data?.link,
      expiresAt: new Date(charge.dueDate + 'T23:59:59'),
    };
  }

  async getChargeStatus(config: BankConnectionConfig, chargeId: string): Promise<BankChargeStatus> {
    const data: any = await efiFetch(`/v1/charge/${chargeId}`, config);
    const s = String(data.data?.status ?? '').toLowerCase();
    const map: Record<string, BankChargeStatus> = {
      new: 'pending', waiting: 'pending', identified: 'paid',
      settled: 'paid', cancelled: 'cancelled', unpaid: 'overdue',
    };
    return map[s] ?? 'pending';
  }

  async refreshToken(config: BankConnectionConfig): Promise<{ accessToken: string; expiresIn: number }> {
    const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
    const res = await fetch(EFI_AUTH, {
      method: 'POST',
      headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ grant_type: 'client_credentials' }),
    });
    if (!res.ok) throw new Error('Efí token refresh failed');
    const data = await res.json();
    return { accessToken: data.access_token, expiresIn: data.expires_in };
  }
}

export const efiProvider = new EfiProvider();
