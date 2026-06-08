// Open Finance Adapter Architecture
// Primary provider: Pluggy (https://pluggy.ai) — real Open Finance Brasil integration
// Belvo/Quanto kept as stubs for future multi-provider support.

import { prisma } from '@/lib/prisma';
import { safeDecrypt } from '@/lib/encrypt';

export interface PluggyAccount {
  id: string;
  itemId: string;
  type: string; // 'BANK' | 'CREDIT'
  subtype: string; // 'CHECKING_ACCOUNT' | 'SAVINGS_ACCOUNT' | 'CREDIT_CARD' | ...
  name: string;
  marketingName?: string;
  number?: string;
  balance: number;
  currencyCode: string;
  bankData?: {
    transferNumber?: string;
    closingBalance?: number;
    automaticallyInvestedBalance?: number;
  };
  creditData?: {
    level?: string;
    brand?: string;
    balanceCloseDate?: string;
    balanceDueDate?: string;
    availableCreditLimit?: number;
    creditLimit?: number;
  };
}

export interface PluggyTransaction {
  id: string;
  accountId: string;
  date: string;
  description: string;
  descriptionRaw?: string;
  amount: number;
  currencyCode: string;
  type: 'DEBIT' | 'CREDIT';
  category?: string;
  categoryId?: string;
  balance?: number;
  providerCode?: string;
  merchant?: { name?: string; businessName?: string; cnpj?: string };
}

export interface PluggyItem {
  id: string;
  connector: { id: number; name: string; institutionUrl?: string; imageUrl?: string; primaryColor?: string };
  status: string; // 'UPDATED' | 'UPDATING' | 'LOGIN_ERROR' | ...
  executionStatus: string;
  lastUpdatedAt?: string;
  createdAt: string;
  error?: { code: string; message: string };
}

const PLUGGY_BASE = process.env.PLUGGY_API_URL || 'https://api.pluggy.ai';

interface PluggyCredentials {
  clientId: string;
  clientSecret: string;
  cacheKey: string;
  source: 'company' | 'env';
}

function readSecret(value: unknown): string {
  if (typeof value !== 'string') return '';
  return safeDecrypt(value) ?? value;
}

/**
 * Lightweight Pluggy client — uses fetch (no external deps).
 * Docs: https://docs.pluggy.ai
 */
export class PluggyClient {
  private apiKeyCache = new Map<string, { key: string; expiresAt: number }>();

  isConfigured(): boolean {
    return !!(process.env.PLUGGY_CLIENT_ID && process.env.PLUGGY_CLIENT_SECRET);
  }

  async isConfiguredForCompany(companyId?: string | null): Promise<boolean> {
    return !!(await this.getCredentials(companyId));
  }

  async getCredentials(companyId?: string | null): Promise<PluggyCredentials | null> {
    if (companyId) {
      const connection = await prisma.companyConnection.findFirst({
        where: {
          companyId,
          providerKey: 'pluggy',
          isActive: true,
        },
        orderBy: { updatedAt: 'desc' },
      });

      const config = (connection?.config as Record<string, any> | null) || null;
      const clientId = String(config?.clientId || '').trim();
      const clientSecret = readSecret(config?.clientSecret).trim();
      if (connection && clientId && clientSecret) {
        return {
          clientId,
          clientSecret,
          cacheKey: `company:${connection.id}:${connection.updatedAt.getTime()}`,
          source: 'company',
        };
      }
    }

    const clientId = process.env.PLUGGY_CLIENT_ID || '';
    const clientSecret = process.env.PLUGGY_CLIENT_SECRET || '';
    if (!clientId || !clientSecret) return null;
    return {
      clientId,
      clientSecret,
      cacheKey: `env:${clientId}`,
      source: 'env',
    };
  }

  /** Step 1: exchange clientId+clientSecret for an API key (valid ~2h). */
  async getApiKey(companyId?: string | null): Promise<string> {
    const credentials = await this.getCredentials(companyId);
    if (!credentials) {
      throw new Error('Pluggy não configurado. Defina PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET.');
    }
    const now = Date.now();
    const cached = this.apiKeyCache.get(credentials.cacheKey);
    if (cached && cached.expiresAt > now) return cached.key;

    const res = await fetch(`${PLUGGY_BASE}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: credentials.clientId, clientSecret: credentials.clientSecret }),
      cache: 'no-store',
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Pluggy auth failed: ${res.status} ${txt}`);
    }
    const data = await res.json();
    // apiKey is valid ~2 hours; cache for 100 min to be safe
    this.apiKeyCache.set(credentials.cacheKey, { key: data.apiKey, expiresAt: now + 100 * 60 * 1000 });
    return data.apiKey;
  }

  /** Step 2: get a short-lived connect_token (~2 min) to initialize the Connect Widget. */
  async createConnectToken(options?: { itemId?: string; clientUserId?: string; webhookUrl?: string; companyId?: string | null }): Promise<string> {
    const apiKey = await this.getApiKey(options?.companyId);
    const res = await fetch(`${PLUGGY_BASE}/connect_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-KEY': apiKey },
      body: JSON.stringify({
        options: {
          clientUserId: options?.clientUserId,
          webhookUrl: options?.webhookUrl,
        },
        itemId: options?.itemId,
      }),
      cache: 'no-store',
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Pluggy connect_token failed: ${res.status} ${txt}`);
    }
    const data = await res.json();
    return data.accessToken as string;
  }

  async getItem(itemId: string, companyId?: string | null): Promise<PluggyItem> {
    const apiKey = await this.getApiKey(companyId);
    const res = await fetch(`${PLUGGY_BASE}/items/${itemId}`, {
      headers: { 'X-API-KEY': apiKey },
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`Pluggy getItem failed: ${res.status}`);
    return res.json();
  }

  async listAccounts(itemId: string, companyId?: string | null): Promise<PluggyAccount[]> {
    const apiKey = await this.getApiKey(companyId);
    const res = await fetch(`${PLUGGY_BASE}/accounts?itemId=${itemId}`, {
      headers: { 'X-API-KEY': apiKey },
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`Pluggy listAccounts failed: ${res.status}`);
    const data = await res.json();
    return data.results || [];
  }

  async listTransactions(accountId: string, from?: Date, to?: Date, companyId?: string | null): Promise<PluggyTransaction[]> {
    const apiKey = await this.getApiKey(companyId);
    const params = new URLSearchParams({ accountId });
    if (from) params.set('from', from.toISOString().slice(0, 10));
    if (to) params.set('to', to.toISOString().slice(0, 10));
    params.set('pageSize', '500');
    const res = await fetch(`${PLUGGY_BASE}/transactions?${params}`, {
      headers: { 'X-API-KEY': apiKey },
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`Pluggy listTransactions failed: ${res.status}`);
    const data = await res.json();
    return data.results || [];
  }

  /** Triggers a new sync (updates item status to UPDATING then UPDATED). */
  async updateItem(itemId: string, companyId?: string | null): Promise<PluggyItem> {
    const apiKey = await this.getApiKey(companyId);
    const res = await fetch(`${PLUGGY_BASE}/items/${itemId}`, {
      method: 'PATCH',
      headers: { 'X-API-KEY': apiKey },
      cache: 'no-store',
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Pluggy updateItem failed: ${res.status} ${txt}`);
    }
    return res.json();
  }

  async deleteItem(itemId: string, companyId?: string | null): Promise<void> {
    const apiKey = await this.getApiKey(companyId);
    const res = await fetch(`${PLUGGY_BASE}/items/${itemId}`, {
      method: 'DELETE',
      headers: { 'X-API-KEY': apiKey },
      cache: 'no-store',
    });
    if (!res.ok && res.status !== 404) {
      throw new Error(`Pluggy deleteItem failed: ${res.status}`);
    }
  }
}

export const pluggy = new PluggyClient();

// Category mapping from Pluggy categories to internal categories
export function mapPluggyCategory(pluggyCategory?: string): string {
  if (!pluggyCategory) return 'Outros';
  const c = pluggyCategory.toLowerCase();
  if (c.includes('food') || c.includes('restaurant') || c.includes('supermarket')) return 'Alimentação';
  if (c.includes('transport') || c.includes('uber') || c.includes('fuel')) return 'Transporte';
  if (c.includes('housing') || c.includes('rent') || c.includes('utilit')) return 'Moradia';
  if (c.includes('health') || c.includes('pharmacy') || c.includes('medical')) return 'Saúde';
  if (c.includes('education') || c.includes('school')) return 'Educação';
  if (c.includes('entertainment') || c.includes('leisure') || c.includes('travel')) return 'Lazer';
  if (c.includes('clothing') || c.includes('apparel')) return 'Vestuário';
  if (c.includes('subscription') || c.includes('service')) return 'Assinaturas';
  if (c.includes('tax')) return 'Impostos';
  if (c.includes('insurance')) return 'Seguros';
  if (c.includes('investment')) return 'Investimentos';
  if (c.includes('salary') || c.includes('income')) return 'Salário';
  return 'Outros';
}

// Map Pluggy subtype → our accountType
export function mapPluggySubtype(subtype: string): string {
  const s = subtype?.toUpperCase();
  if (s === 'CHECKING_ACCOUNT') return 'checking';
  if (s === 'SAVINGS_ACCOUNT') return 'savings';
  if (s === 'CREDIT_CARD') return 'credit';
  return 'checking';
}
