// Asaas API connector
// Docs: https://docs.asaas.com/
// Auth: API Key (header access_token) — no OAuth, simpler integration
// BANK_CODE: Asaas is a payment gateway, not a traditional bank

import { normalizeAPITransaction } from '../bank-transaction-normalizer';
import type { BankProvider, BankConnectionConfig, BankBalance, BankTransaction, BankChargeInput, BankChargeResult, BankChargeStatus } from '../bank-provider.interface';

const ASAAS_BASE = process.env.ASAAS_API_URL ?? 'https://sandbox.asaas.com/api/v3';

async function asaasFetch(path: string, config: BankConnectionConfig, options?: RequestInit): Promise<unknown> {
  const apiKey = config.clientSecret ?? config.accessToken ?? '';
  const res = await fetch(`${ASAAS_BASE}${path}`, {
    ...options,
    headers: { access_token: apiKey, 'Content-Type': 'application/json', ...(options?.headers ?? {}) },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Asaas API error ${res.status}: ${err}`);
  }
  return res.json();
}

export class AsaasProvider implements BankProvider {
  readonly providerName = 'asaas';

  async testConnection(config: BankConnectionConfig): Promise<boolean> {
    try {
      await asaasFetch('/finance/balance', config);
      return true;
    } catch { return false; }
  }

  async getBalance(config: BankConnectionConfig): Promise<BankBalance> {
    const data: any = await asaasFetch('/finance/balance', config);
    return {
      available: Number(data.balance ?? 0),
      currency: 'BRL',
      asOf: new Date(),
    };
  }

  async getTransactions(config: BankConnectionConfig, startDate: string, endDate: string): Promise<BankTransaction[]> {
    const params = new URLSearchParams({ startDate, finishDate: endDate, limit: '100' });
    const data: any = await asaasFetch(`/financialTransactions?${params}`, config);
    return (data.data ?? []).map((row: any) =>
      normalizeAPITransaction({
        bankCode: 'asaas',
        account: config.account,
        externalId: row.id,
        type: row.type === 'CREDIT' ? 'credit' : 'debit',
        amount: Math.abs(Number(row.value)),
        date: new Date(row.date),
        description: row.description ?? row.type ?? 'Transação Asaas',
        documentNumber: row.externalReference,
        raw: row,
      }),
    );
  }

  async createCharge(config: BankConnectionConfig, charge: BankChargeInput): Promise<BankChargeResult> {
    // Find or create customer
    const customerSearch: any = await asaasFetch(`/customers?cpfCnpj=${charge.payerDocument.replace(/\D/g, '')}`, config);
    let customerId = customerSearch.data?.[0]?.id;

    if (!customerId) {
      const newCustomer: any = await asaasFetch('/customers', config, {
        method: 'POST',
        body: JSON.stringify({ name: charge.payerName, cpfCnpj: charge.payerDocument.replace(/\D/g, '') }),
      });
      customerId = newCustomer.id;
    }

    const body = {
      customer: customerId,
      billingType: 'BOLETO',
      dueDate: charge.dueDate,
      value: charge.amount,
      description: charge.description,
    };

    const data: any = await asaasFetch('/payments', config, { method: 'POST', body: JSON.stringify(body) });

    return {
      chargeId: data.id,
      barcode: data.bankSlipUrl,
      pixQrCode: data.pixQrCodeUrl,
      pdfUrl: data.invoiceUrl,
      expiresAt: new Date(charge.dueDate + 'T23:59:59'),
    };
  }

  async getChargeStatus(config: BankConnectionConfig, chargeId: string): Promise<BankChargeStatus> {
    const data: any = await asaasFetch(`/payments/${chargeId}`, config);
    const map: Record<string, BankChargeStatus> = {
      PENDING: 'pending', RECEIVED: 'paid', CONFIRMED: 'paid',
      OVERDUE: 'overdue', REFUNDED: 'cancelled',
    };
    return map[String(data.status)] ?? 'pending';
  }
}

export const asaasProvider = new AsaasProvider();
