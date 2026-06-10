import crypto from 'crypto';
import type { TransactionDirection } from './bank-provider.interface';

export function normalizeTransactionDescription(description: string): string {
  return description
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9 ]/g, '');
}

export function formatTransactionDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function createBankTransactionHash(input: {
  bankCode: string;
  accountId: string;
  transactionDate: Date;
  direction: TransactionDirection;
  amount: number;
  description: string;
  externalId?: string;
  documentNumber?: string;
}): string {
  const externalOrDocument = input.externalId || input.documentNumber || '';
  const raw = [
    input.bankCode,
    input.accountId,
    formatTransactionDate(input.transactionDate),
    input.direction,
    Math.abs(input.amount).toFixed(2),
    normalizeTransactionDescription(input.description),
    externalOrDocument.trim(),
  ].join('|');

  return crypto.createHash('sha256').update(raw).digest('hex');
}
