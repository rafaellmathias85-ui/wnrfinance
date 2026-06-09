import type { ParsedTransaction } from '@/lib/ofx-parser';
import type { BankTransaction } from './bank-provider.interface';
import { hashFromStatement } from './bank-transaction-hash';

interface NormalizeContext {
  bankCode: string;
  agency?: string;
  account: string;
}

// Normalize a raw OFX/CSV parsed transaction into the unified BankTransaction shape.
export function normalizeOFXTransaction(
  tx: ParsedTransaction,
  ctx: NormalizeContext,
): BankTransaction {
  return {
    externalId: tx.externalId,
    transactionHash: hashFromStatement({
      bankCode: ctx.bankCode,
      agency: ctx.agency,
      account: ctx.account,
      date: tx.date,
      amount: tx.amount,
      description: tx.description,
      documentNumber: tx.checkNum,
    }),
    type: tx.type,
    amount: tx.amount,
    date: tx.date,
    description: tx.description,
    documentNumber: tx.checkNum,
    rawPayload: { memo: tx.memo, checkNum: tx.checkNum },
  };
}

// Normalize a free-form API response row into the unified BankTransaction shape.
// Each bank provider handles its own mapping before calling this.
export function normalizeAPITransaction(params: {
  bankCode: string;
  agency?: string;
  account: string;
  externalId: string;
  type: 'credit' | 'debit';
  amount: number;
  date: Date;
  description: string;
  documentNumber?: string;
  payerName?: string;
  payerDocument?: string;
  balanceAfter?: number;
  raw?: unknown;
}): BankTransaction {
  return {
    externalId: params.externalId,
    transactionHash: hashFromStatement({
      bankCode: params.bankCode,
      agency: params.agency,
      account: params.account,
      date: params.date,
      amount: params.amount,
      description: params.description,
      documentNumber: params.documentNumber,
    }),
    type: params.type,
    amount: params.amount,
    date: params.date,
    description: params.description,
    documentNumber: params.documentNumber,
    payerName: params.payerName,
    payerDocument: params.payerDocument,
    balanceAfter: params.balanceAfter,
    rawPayload: params.raw,
  };
}
