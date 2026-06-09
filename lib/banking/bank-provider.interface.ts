// Core banking provider interface — implemented by every bank connector

export interface BankConnectionConfig {
  bankCode: string;
  agency?: string;
  account: string;
  accountDigit?: string;
  clientId?: string;       // decrypted at runtime
  clientSecret?: string;   // decrypted at runtime
  certPath?: string;
  certPassword?: string;
  accessToken?: string;
  refreshToken?: string;
  extra?: Record<string, string>; // bank-specific fields (convenio, cooperativa, etc.)
}

export interface BankBalance {
  available: number;
  blocked?: number;
  currency: string;
  asOf: Date;
}

export interface BankTransaction {
  externalId: string;
  transactionHash: string;
  type: 'credit' | 'debit';
  amount: number;
  date: Date;
  description: string;
  documentNumber?: string;
  payerName?: string;
  payerDocument?: string;
  balanceAfter?: number;
  rawPayload?: unknown;
}

export interface BankChargeInput {
  amount: number;
  dueDate: string;       // YYYY-MM-DD
  payerName: string;
  payerDocument: string; // CPF or CNPJ
  description?: string;
  expiresInDays?: number;
}

export interface BankChargeResult {
  chargeId: string;
  barcode?: string;
  pixQrCode?: string;
  pixKey?: string;
  pdfUrl?: string;
  expiresAt: Date;
}

export type BankChargeStatus = 'pending' | 'paid' | 'cancelled' | 'expired' | 'overdue';

export interface BankProvider {
  readonly providerName: string;

  testConnection(config: BankConnectionConfig): Promise<boolean>;

  getBalance(config: BankConnectionConfig): Promise<BankBalance>;

  getTransactions(
    config: BankConnectionConfig,
    startDate: string,   // YYYY-MM-DD
    endDate: string,     // YYYY-MM-DD
  ): Promise<BankTransaction[]>;

  createCharge?(
    config: BankConnectionConfig,
    charge: BankChargeInput,
  ): Promise<BankChargeResult>;

  getChargeStatus?(
    config: BankConnectionConfig,
    chargeId: string,
  ): Promise<BankChargeStatus>;

  refreshToken?(config: BankConnectionConfig): Promise<{ accessToken: string; expiresIn: number }>;
}
