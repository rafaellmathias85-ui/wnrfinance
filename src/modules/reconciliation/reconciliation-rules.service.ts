interface MatchInput {
  amount: number;
  date: Date;
  description: string;
  documentNumber?: string | null;
  counterpartyTaxId?: string | null;
}

export interface MatchCandidate {
  id: string;
  type: 'expense' | 'income';
  amount: number;
  date: Date;
  description: string;
  documentNumber?: string | null;
  taxId?: string | null;
}

export class ReconciliationRulesService {
  score(bankTransaction: MatchInput, candidate: MatchCandidate): number {
    let score = 0;

    if (sameAmount(bankTransaction.amount, candidate.amount)) {
      score += 40;
    }

    if (nearDate(bankTransaction.date, candidate.date)) {
      score += 25;
    }

    if (sameDocument(bankTransaction.counterpartyTaxId, candidate.taxId)) {
      score += 20;
    }

    if (similarDescription(bankTransaction.description, candidate.description)) {
      score += 10;
    }

    if (sameDocument(bankTransaction.documentNumber, candidate.documentNumber)) {
      score += 5;
    }

    return score;
  }
}

function sameAmount(a: number, b: number): boolean {
  return Math.abs(Math.abs(a) - Math.abs(b)) < 0.01;
}

function nearDate(a: Date, b: Date): boolean {
  const days = Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86400000;
  return days <= 3;
}

function sameDocument(a?: string | null, b?: string | null): boolean {
  const normalizedA = normalizeDigits(a);
  const normalizedB = normalizeDigits(b);
  return Boolean(normalizedA && normalizedB && normalizedA === normalizedB);
}

function similarDescription(a: string, b: string): boolean {
  const wordsA = new Set(normalizeText(a).split(' ').filter(Boolean));
  const wordsB = new Set(normalizeText(b).split(' ').filter(Boolean));
  if (!wordsA.size || !wordsB.size) return false;
  const intersection = [...wordsA].filter((word) => wordsB.has(word)).length;
  const union = new Set([...wordsA, ...wordsB]).size;
  return intersection / union >= 0.35;
}

function normalizeDigits(value?: string | null): string {
  return value?.replace(/\D/g, '') || '';
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export const reconciliationRulesService = new ReconciliationRulesService();
