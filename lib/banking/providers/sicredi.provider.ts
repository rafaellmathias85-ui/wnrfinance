// Sicredi API connector — stub
// Docs: https://developer.sicredi.com.br/
// Auth: OAuth2 + certificate (similar to Sicoob)
// BANK_CODE: 748

import { normalizeAPITransaction } from '../bank-transaction-normalizer';
import type { BankProvider, BankConnectionConfig, BankBalance, BankTransaction } from '../bank-provider.interface';

const SICREDI_BASE = process.env.SICREDI_API_URL ?? 'https://api-parceiros.sicredi.com.br';
const SICREDI_AUTH = process.env.SICREDI_AUTH_URL ?? 'https://auth-parceiros.sicredi.com.br/auth/realms/parceiros/protocol/openid-connect/token';

async function getAccessToken(config: BankConnectionConfig): Promise<string> {
  if (config.accessToken) return config.accessToken;
  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: config.clientId!,
    client_secret: config.clientSecret!,
  });
  const res = await fetch(SICREDI_AUTH, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString() });
  if (!res.ok) throw new Error(`Sicredi auth failed: ${res.status}`);
  const data = await res.json();
  return data.access_token;
}

export class SicrediProvider implements BankProvider {
  readonly providerName = 'sicredi';

  async testConnection(config: BankConnectionConfig): Promise<boolean> {
    try { await getAccessToken(config); return true; } catch { return false; }
  }

  async getBalance(config: BankConnectionConfig): Promise<BankBalance> {
    const token = await getAccessToken(config);
    const res = await fetch(`${SICREDI_BASE}/open-banking/v1/conta-corrente/saldo`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Sicredi balance error: ${res.status}`);
    const data: any = await res.json();
    return { available: Number(data.saldoDisponivelSaque ?? 0), currency: 'BRL', asOf: new Date() };
  }

  async getTransactions(config: BankConnectionConfig, startDate: string, endDate: string): Promise<BankTransaction[]> {
    const token = await getAccessToken(config);
    const params = new URLSearchParams({ dataInicio: startDate, dataFim: endDate });
    const res = await fetch(`${SICREDI_BASE}/open-banking/v1/conta-corrente/extrato?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Sicredi extrato error: ${res.status}`);
    const data: any = await res.json();
    return (data.lancamentos ?? []).map((row: any) =>
      normalizeAPITransaction({
        bankCode: '748',
        agency: config.agency,
        account: config.account,
        externalId: row.id ?? `sicredi_${row.data}_${row.valor}`,
        type: row.natureza === 'C' ? 'credit' : 'debit',
        amount: Math.abs(Number(row.valor)),
        date: new Date(row.data),
        description: row.descricao ?? 'Lançamento Sicredi',
        documentNumber: row.documento,
        raw: row,
      }),
    );
  }
}

export const sicrediProvider = new SicrediProvider();
