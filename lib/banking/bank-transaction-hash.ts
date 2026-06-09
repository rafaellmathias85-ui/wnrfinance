import crypto from 'crypto';

interface HashInput {
  bankCode: string;
  agency?: string;
  account: string;
  transactionDate: string; // YYYY-MM-DD
  amount: number;
  description: string;
  documentNumber?: string;
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

// Deterministic hash per transaction — used for deduplication across import methods.
// sha256(bankCode + agency + account + date + amount_cents + normalizedDesc + docNumber)
export function buildTransactionHash(input: HashInput): string {
  const amountCents = Math.round(Math.abs(input.amount) * 100).toString();
  const raw = [
    input.bankCode.trim(),
    (input.agency ?? '').trim(),
    input.account.trim(),
    input.transactionDate,
    amountCents,
    normalizeText(input.description),
    normalizeText(input.documentNumber ?? ''),
  ].join('|');

  return crypto.createHash('sha256').update(raw).digest('hex');
}

// Build hash directly from a parsed OFX/CSV transaction when bankCode/account are known
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
    description: params.description,
    documentNumber: params.documentNumber,
  });
}
