import crypto from 'crypto';

interface HashInput {
  bankCode: string;
  agency?: string;
  account: string;
  transactionDate: string; // YYYY-MM-DD
  amount: number;
  direction?: 'CREDIT' | 'DEBIT' | 'credit' | 'debit';
  description: string;
  documentNumber?: string;
  externalId?: string;
}

function normalizeText(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9 ]/g, '');
}

// Deterministic hash per transaction, used for deduplication across import methods.
// sha256(bank_code + account_id + date + direction + amount + normalized_description + external_or_document)
export function buildTransactionHash(input: HashInput): string {
  const direction = (input.direction || (input.amount >= 0 ? 'CREDIT' : 'DEBIT')).toUpperCase();
  const raw = [
    input.bankCode.trim(),
    input.account.trim(),
    input.transactionDate,
    direction,
    Math.abs(input.amount).toFixed(2),
    normalizeText(input.description),
    (input.externalId || input.documentNumber || '').trim(),
  ].join('|');

  return crypto.createHash('sha256').update(raw).digest('hex');
}

// Build hash directly from a parsed OFX/CSV transaction when bankCode/account are known.
export function hashFromStatement(params: {
  bankCode: string;
  agency?: string;
  account: string;
  date: Date;
  amount: number;
  description: string;
  documentNumber?: string;
}): string {
  const dateStr = params.date.toISOString().slice(0, 10);
  return buildTransactionHash({
    bankCode: params.bankCode,
    agency: params.agency,
    account: params.account,
    transactionDate: dateStr,
    amount: params.amount,
    direction: params.amount >= 0 ? 'CREDIT' : 'DEBIT',
    description: params.description,
    documentNumber: params.documentNumber,
  });
}
