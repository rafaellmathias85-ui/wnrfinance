// Itaú API connector — stub
// Docs: https://developer.itau.com.br/
// Auth: OAuth2 client_credentials + certificate (for PJ)
// BANK_CODE: 341

import { normalizeAPITransaction } from '../bank-transaction-normalizer';
import type { BankProvider, BankConnectionConfig, BankBalance, BankTransaction } from '../bank-provider.interface';

const ITAU_BASE = process.env.ITAU_API_URL ?? 'https://sts.itau.com.br';

async function getAccessToken(config: BankConnectionConfig): Promise<string> {
  if (config.accessToken) return config.accessToken;
  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: config.clientId!,
    client_secret: config.clientSecret!,
  });
  const res = await fetch(`${ITAU_BASE}/api/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  if (!res.ok) throw new Error(`Itaú auth failed: ${res.status}`);
  const data = await res.json();
  return data.access_token;
}

export class ItauProvider implements BankProvider {
  readonly providerName = 'itau';

  async testConnection(config: BankConnectionConfig): Promise<boolean> {
    try { await getAccessToken(config); return true; } catch { return false; }
  }

  async getBalance(config: BankConnectionConfig): Promise<BankBalance> {
    const token = await getAccessToken(config);
    const agencia = config.agency;
    const conta = config.account;
    const res = await fetch(`${ITAU_BASE}/v1/accounts/${agencia}/${conta}/balance`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Itaú balance error: ${res.status}`);
    const data: any = await res.json();
    return { available: Number(data.available_amount ?? 0), currency: 'BRL', asOf: new Date() };
  }

  async getTransactions(config: BankConnectionConfig, startDate: string, endDate: string): Promise<BankTransaction[]> {
    const token = await getAccessToken(config);
    const agencia = config.agency;
    const conta = config.account;
    const params = new URLSearchParams({ start_date: startDate, end_date: endDate });
    const res = await fetch(`${ITAU_BASE}/v1/accounts/${agencia}/${conta}/transactions?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Itaú transactions error: ${res.status}`);
    const data: any = await res.json();
    return (data.transactions ?? []).map((row: any) =>
      normalizeAPITransaction({
        bankCode: '341',
        agency: config.agency,
        account: config.account,
        externalId: row.id ?? `itau_${row.date}_${row.amount}`,
        type: Number(row.amount) > 0 ? 'credit' : 'debit',
        amount: Math.abs(Number(row.amount)),
        date: new Date(row.date),
        description: row.description ?? 'Lançamento Itaú',
        raw: row,
      }),
    );
  }
}

export const itauProvider = new ItauProvider();
