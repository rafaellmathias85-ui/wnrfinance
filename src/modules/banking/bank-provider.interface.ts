export type PersonType = 'PF' | 'PJ';
export type BankCode = 'INTER' | 'ITAU';
export type BankConnectionMode = 'API' | 'OFX' | 'CSV' | 'OPEN_FINANCE_FUTURE';
export type BankConnectionStatus = 'ACTIVE' | 'ERROR' | 'DISABLED' | 'PENDING_CONFIG';
export type TransactionDirection = 'CREDIT' | 'DEBIT';
export type TransactionStatus = 'SETTLED' | 'PENDING';
export type ReconciliationStatus = 'PENDING' | 'SUGGESTED' | 'RECONCILED' | 'IGNORED';

export interface BankBalance {
  available: number;
  current: number;
  blocked?: number;
  currency: 'BRL';
  importedAt: Date;
}

export interface CanonicalTransaction {
  id: string;
  externalId?: string;
  bank: string;
  bankCode: string;
  accountId: string;
  personType: PersonType;
  date: Date;
  amount: number;
  direction: TransactionDirection;
  description: string;
  documentNumber?: string;
  counterpartyName?: string;
  counterpartyTaxId?: string;
  balanceAfter?: number;
  status: TransactionStatus;
  rawData: Record<string, unknown>;
  importedAt: Date;
  checksum: string;
}

export interface BankConnectionTestResult {
  success: boolean;
  message: string;
  balancePreview?: BankBalance;
  errorCode?: 'API_NOT_AVAILABLE' | 'PENDING_CONFIG' | 'CONNECTION_ERROR';
}

export interface BankConnection {
  id: string;
  userId: string;
  companyId?: string | null;
  scope?: string | null;
  personType: PersonType;
  bankCode?: string | null;
  bankName?: string | null;
  provider: string;
  connectionMode: BankConnectionMode | string;
  agency?: string | null;
  accountNumber?: string | null;
  accountDigit?: string | null;
  accountId?: string | null;
  ownerTaxIdEnc?: string | null;
  clientIdEnc?: string | null;
  clientSecretEnc?: string | null;
  certificateEnc?: string | null;
  privateKeyEnc?: string | null;
  certPasswordEnc?: string | null;
  extraConfig?: unknown;
}

export interface BankProvider {
  providerName: string;
  bankCode: string;
  personType: PersonType;

  testConnection(): Promise<BankConnectionTestResult>;

  getBalance(): Promise<BankBalance>;

  getTransactions(
    startDate: Date,
    endDate: Date
  ): Promise<CanonicalTransaction[]>;
}

export interface StatementImportPreview {
  importId: string;
  bankCode: string;
  accountId: string;
  total: number;
  duplicates: number;
  errors: Array<{ row: number; message: string }>;
  transactions: Array<CanonicalTransaction & { duplicate: boolean }>;
}

export interface StatementImportResult {
  imported: number;
  skipped: number;
  total: number;
  reconciliation: {
    processed: number;
    reconciled: number;
    suggested: number;
    pending: number;
  };
}
