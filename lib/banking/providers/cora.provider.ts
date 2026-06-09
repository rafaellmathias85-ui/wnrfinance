// Cora Bank API connector — stub
// Docs: https://developers.cora.com.br/
// Auth: OAuth2 client_credentials
// Focused on MEI and small businesses — no certificate required in sandbox
// BANK_CODE: 403

import { normalizeAPITransaction } from '../bank-transaction-normalizer';
import type { BankProvider, BankConnectionConfig, BankBalance, BankTransaction, BankChargeInput, BankChargeResult, BankChargeStatus } from '../bank-provider.interface';

const CORA_BASE = process.env.CORA_API_URL ?? 'https://matls-clients.api.stage.cora.com.br';
const CORA_AUTH = process.env.CORA_AUTH_URL ?? 'https://matls-clients.api.stage.cora.com.br/auth/token';

async function getAccessToken(config: BankConnectionConfig): Promise<string> {
  if (config.accessToken) return config.accessToken;
  const params = new URLSearchParams({ grant_type: 'client_credentials', client_id: config.clientId! });
  const res = await fetch(CORA_AUTH, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString() });
  if (!res.ok) throw new Error(`Cora auth failed: ${res.status}`);
  const data = await res.json();
  return data.access_token;
}

export class CoraProvider implements BankProvider {
  readonly providerName = 'cora';

  async testConnection(config: BankConnectionConfig): Promise<boolean> {
    try { await getAccessToken(config); return true; } catch { return false; }
  }

  async getBalance(config: BankConnectionConfig): Promise<BankBalance> {
    const token = await getAccessToken(config);
    const res = await fetch(`${CORA_BASE}/balance`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Cora balance error`);
    const data: any = await res.json();
    return { available: Number(data.available ?? 0), currency: 'BRL', asOf: new Date() };
  }

  async getTransactions(config: BankConnectionConfig, startDate: string, endDate: string): Promise<BankTransaction[]> {
    const token = await getAccessToken(config);
    const params = new URLSearchParams({ start: startDate, end: endDate });
    const res = await fetch(`${CORA_BASE}/transactions?${params}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Cora transactions error`);
    const data: any = await res.json();
    return (data.items ?? []).map((row: any) =>
      normalizeAPITransaction({
        bankCode: '403',
        account: config.account,
        externalId: row.id ?? `cora_${row.date}_${row.amount}`,
        type: row.type === 'CREDIT' ? 'credit' : 'debit',
        amount: Math.abs(Number(row.amount)),
        date: new Date(row.date),
        description: row.description ?? 'Lançamento Cora',
        raw: row,
      }),
    );
  }

  async createCharge(config: BankConnectionConfig, charge: BankChargeInput): Promise<BankChargeResult> {
    const token = await getAccessToken(config);
    const body = { amount: Math.round(charge.amount * 100), due_date: charge.dueDate, description: charge.description, customer: { name: charge.payerName, document: charge.payerDocument.replace(/\D/g, '') } };
    const res = await fetch(`${CORA_BASE}/invoices`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`Cora charge error`);
    const data: any = await res.json();
    return { chargeId: data.id, barcode: data.bank_slip?.barcode, pixQrCode: data.pix?.qr_code, expiresAt: new Date(charge.dueDate + 'T23:59:59') };
  }

  async getChargeStatus(config: BankConnectionConfig, chargeId: string): Promise<BankChargeStatus> {
    const token = await getAccessToken(config);
    const res = await fetch(`${CORA_BASE}/invoices/${chargeId}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Cora charge status error`);
    const data: any = await res.json();
    const map: Record<string, BankChargeStatus> = { PENDING: 'pending', PAID: 'paid', CANCELLED: 'cancelled', EXPIRED: 'expired', OVERDUE: 'overdue' };
    return map[String(data.status).toUpperCase()] ?? 'pending';
  }
}

export const coraProvider = new CoraProvider();
