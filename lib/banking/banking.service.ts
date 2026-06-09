import type { BankProvider, BankConnectionConfig, BankTransaction } from './bank-provider.interface';
import { decryptCredential } from './crypto';

// Provider registry — add new providers here
import { ofxProvider } from './providers/ofx.provider';
import { bancoInterProvider } from './providers/banco-inter.provider';
import { bancoBrasilProvider } from './providers/banco-brasil.provider';
import { sicoobProvider } from './providers/sicoob.provider';
import { sicrediProvider } from './providers/sicredi.provider';
import { itauProvider } from './providers/itau.provider';
import { santanderProvider } from './providers/santander.provider';
import { bradescoProvider } from './providers/bradesco.provider';
import { coraProvider } from './providers/cora.provider';
import { asaasProvider } from './providers/asaas.provider';
import { efiProvider } from './providers/efi.provider';
import { openFinancePlaceholderProvider } from './providers/open-finance-placeholder.provider';

const PROVIDERS: Record<string, BankProvider> = {
  'ofx': ofxProvider,
  'banco-inter': bancoInterProvider,
  'banco-brasil': bancoBrasilProvider,
  'sicoob': sicoobProvider,
  'sicredi': sicrediProvider,
  'itau': itauProvider,
  'santander': santanderProvider,
  'bradesco': bradescoProvider,
  'cora': coraProvider,
  'asaas': asaasProvider,
  'efi': efiProvider,
  'open-finance': openFinancePlaceholderProvider,
  // Legacy aliases
  'manual': ofxProvider,
  'pluggy': openFinancePlaceholderProvider,
};

export function getProvider(providerName: string): BankProvider {
  const provider = PROVIDERS[providerName.toLowerCase()];
  if (!provider) throw new Error(`Unknown bank provider: ${providerName}`);
  return provider;
}

export function listProviders(): Array<{ name: string; providerName: string }> {
  return Object.entries(PROVIDERS)
    .filter(([key]) => !['manual', 'pluggy'].includes(key)) // hide aliases
    .map(([key, p]) => ({ name: key, providerName: p.providerName }));
}

// Decrypt a BankConnection record into a usable BankConnectionConfig.
// The DB row must include clientIdEnc, clientSecretEnc, certPathEnc, certPasswordEnc, accessTokenEnc.
export function buildConfig(dbRow: {
  bankCode?: string | null;
  agency?: string | null;
  accountNumber?: string | null;
  accountDigit?: string | null;
  clientIdEnc?: string | null;
  clientSecretEnc?: string | null;
  certPathEnc?: string | null;
  certPasswordEnc?: string | null;
  accessTokenEnc?: string | null;
  refreshTokenEnc?: string | null;
  extra?: Record<string, string> | null;
}): BankConnectionConfig {
  const safe = (enc: string | null | undefined) => {
    if (!enc) return undefined;
    try { return decryptCredential(enc); } catch { return undefined; }
  };

  return {
    bankCode: dbRow.bankCode ?? 'unknown',
    agency: dbRow.agency ?? undefined,
    account: dbRow.accountNumber ?? '',
    accountDigit: dbRow.accountDigit ?? undefined,
    clientId: safe(dbRow.clientIdEnc),
    clientSecret: safe(dbRow.clientSecretEnc),
    certPath: safe(dbRow.certPathEnc),
    certPassword: safe(dbRow.certPasswordEnc),
    accessToken: safe(dbRow.accessTokenEnc),
    refreshToken: safe(dbRow.refreshTokenEnc),
    extra: dbRow.extra ?? undefined,
  };
}

// Fetch transactions from the appropriate provider, with fallback logging.
export async function syncTransactions(params: {
  provider: string;
  config: BankConnectionConfig;
  startDate: string;
  endDate: string;
}): Promise<{ transactions: BankTransaction[]; error?: string }> {
  try {
    const p = getProvider(params.provider);
    const transactions = await p.getTransactions(params.config, params.startDate, params.endDate);
    return { transactions };
  } catch (err: any) {
    return {
      transactions: [],
      error: err?.message ?? 'Sync failed',
    };
  }
}
