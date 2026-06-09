// Santander API connector — stub
// Docs: https://developer.santander.com.br/
// Auth: OAuth2 + certificate for empresas
// BANK_CODE: 033

import { normalizeAPITransaction } from '../bank-transaction-normalizer';
import type { BankProvider, BankConnectionConfig, BankBalance, BankTransaction } from '../bank-provider.interface';

const SANTANDER_BASE = process.env.SANTANDER_API_URL ?? 'https://trust-sandbox.santander.com.br';

async function getAccessToken(config: BankConnectionConfig): Promise<string> {
  if (config.accessToken) return config.accessToken;
  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: config.clientId!,
    client_secret: config.clientSecret!,
  });
  const res = await fetch(`${SANTANDER_BASE}/production/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  if (!res.ok) throw new Error(`Santander auth failed: ${res.status}`);
  const data = await res.json();
  return data.access_token;
}

export class SantanderProvider implements BankProvider {
  readonly providerName = 'santander';

  async testConnection(config: BankConnectionConfig): Promise<boolean> {
    try { await getAccessToken(config); return true; } catch { return false; }
  }

  async getBalance(config: BankConnectionConfig): Promise<BankBalance> {
    const token = await getAccessToken(config);
    const res = await fetch(`${SANTANDER_BASE}/production/collection_bill_management/v2/balance`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Santander balance error: ${res.status}`);
    const data: any = await res.json();
    return { available: Number(data.balance ?? 0), currency: 'BRL', asOf: new Date() };
  }

  async getTransactions(config: BankConnectionConfig, startDate: string, endDate: string): Promise<BankTransaction[]> {
    const token = await getAccessToken(config);
    const params = new URLSearchParams({ startDate, endDate });
    const res = await fetch(`${SANTANDER_BASE}/production/account_statement/v1/statements?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Santander statement error: ${res.status}`);
    const data: any = await res.json();
    return (data.content ?? []).map((row: any) =>
      normalizeAPITransaction({
        bankCode: '033',
        agency: config.agency,
        account: config.account,
        externalId: row.transactionId ?? `santander_${row.transactionDate}_${row.amount}`,
        type: row.creditDebitType === 'CREDIT' ? 'credit' : 'debit',
        amount: Math.abs(Number(row.amount)),
        date: new Date(row.transactionDate),
        description: row.remittanceInformation ?? row.additionalInformation ?? 'Lançamento Santander',
        raw: row,
      }),
    );
  }
}

export const santanderProvider = new SantanderProvider();
