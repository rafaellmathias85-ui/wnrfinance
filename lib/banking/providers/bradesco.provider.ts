// Bradesco API connector — stub
// Docs: https://developers.bradesco.com.br/
// Auth: OAuth2 + certificate (for empresas)
// BANK_CODE: 237

import { normalizeAPITransaction } from '../bank-transaction-normalizer';
import type { BankProvider, BankConnectionConfig, BankBalance, BankTransaction } from '../bank-provider.interface';

const BRADESCO_BASE = process.env.BRADESCO_API_URL ?? 'https://proxy.api.prebanco.com.br';

async function getAccessToken(config: BankConnectionConfig): Promise<string> {
  if (config.accessToken) return config.accessToken;
  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: config.clientId!,
    client_secret: config.clientSecret!,
  });
  const res = await fetch(`${BRADESCO_BASE}/auth/server/v1.1/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  if (!res.ok) throw new Error(`Bradesco auth failed: ${res.status}`);
  const data = await res.json();
  return data.access_token;
}

export class BradescoProvider implements BankProvider {
  readonly providerName = 'bradesco';

  async testConnection(config: BankConnectionConfig): Promise<boolean> {
    try { await getAccessToken(config); return true; } catch { return false; }
  }

  async getBalance(config: BankConnectionConfig): Promise<BankBalance> {
    const token = await getAccessToken(config);
    const res = await fetch(`${BRADESCO_BASE}/v1/accounts/${config.account}/balance`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Bradesco balance error: ${res.status}`);
    const data: any = await res.json();
    return { available: Number(data.availableAmount ?? 0), currency: 'BRL', asOf: new Date() };
  }

  async getTransactions(config: BankConnectionConfig, startDate: string, endDate: string): Promise<BankTransaction[]> {
    const token = await getAccessToken(config);
    const params = new URLSearchParams({ startDate, endDate });
    const res = await fetch(`${BRADESCO_BASE}/v1/accounts/${config.account}/transactions?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Bradesco transactions error: ${res.status}`);
    const data: any = await res.json();
    return (data.transactions ?? []).map((row: any) =>
      normalizeAPITransaction({
        bankCode: '237',
        agency: config.agency,
        account: config.account,
        externalId: row.transactionId ?? `bradesco_${row.date}_${row.amount}`,
        type: row.creditDebitType === 'CREDIT' ? 'credit' : 'debit',
        amount: Math.abs(Number(row.amount)),
        date: new Date(row.bookingDate ?? row.date),
        description: row.remittanceInformation ?? row.description ?? 'Lançamento Bradesco',
        raw: row,
      }),
    );
  }
}

export const bradescoProvider = new BradescoProvider();
