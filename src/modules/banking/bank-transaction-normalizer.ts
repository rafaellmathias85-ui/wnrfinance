import type { ParsedTransaction } from '@/lib/ofx-parser';
import { createBankTransactionHash } from './bank-transaction-hash';
import type { CanonicalTransaction, PersonType, TransactionDirection } from './bank-provider.interface';

function directionFromAmountOrType(amount: number, type?: string): TransactionDirection {
  const normalizedType = type?.toUpperCase();
  if (normalizedType === 'CREDIT' || normalizedType === 'CREDITO' || normalizedType === 'CRÉDITO') {
    return 'CREDIT';
  }
  if (normalizedType === 'DEBIT' || normalizedType === 'DEBITO' || normalizedType === 'DÉBITO') {
    return 'DEBIT';
  }
  return amount >= 0 ? 'CREDIT' : 'DEBIT';
}

export function normalizeCanonicalTransaction(input: {
  bank: string;
  bankCode: string;
  accountId: string;
  personType: PersonType;
  externalId?: string;
  date: Date;
  amount: number;
  direction?: TransactionDirection;
  description: string;
  documentNumber?: string;
  counterpartyName?: string;
  counterpartyTaxId?: string;
  balanceAfter?: number;
  status?: 'SETTLED' | 'PENDING';
  rawData: Record<string, unknown>;
}): CanonicalTransaction {
  const direction = input.direction ?? directionFromAmountOrType(input.amount);
  const amount = Math.abs(Number(input.amount) || 0);
  const checksum = createBankTransactionHash({
    bankCode: input.bankCode,
    accountId: input.accountId,
    transactionDate: input.date,
    direction,
    amount,
    description: input.description,
    externalId: input.externalId,
    documentNumber: input.documentNumber,
  });

  return {
    id: input.externalId || checksum,
    externalId: input.externalId,
    bank: input.bank,
    bankCode: input.bankCode,
    accountId: input.accountId,
    personType: input.personType,
    date: input.date,
    amount,
    direction,
    description: input.description || 'Transação importada',
    documentNumber: input.documentNumber,
    counterpartyName: input.counterpartyName,
    counterpartyTaxId: input.counterpartyTaxId,
    balanceAfter: input.balanceAfter,
    status: input.status ?? 'SETTLED',
    rawData: input.rawData,
    importedAt: new Date(),
    checksum,
  };
}

export function normalizeParsedStatementTransaction(
  tx: ParsedTransaction,
  context: {
    bank: string;
    bankCode: string;
    accountId: string;
    personType: PersonType;
  },
): CanonicalTransaction {
  return normalizeCanonicalTransaction({
    bank: context.bank,
    bankCode: context.bankCode,
    accountId: context.accountId,
    personType: context.personType,
    externalId: tx.externalId,
    date: tx.date,
    amount: tx.amount,
    direction: tx.type === 'credit' ? 'CREDIT' : 'DEBIT',
    description: tx.description,
    documentNumber: tx.checkNum,
    rawData: {
      memo: tx.memo,
      checkNum: tx.checkNum,
      sourceType: tx.type,
    },
  });
}
