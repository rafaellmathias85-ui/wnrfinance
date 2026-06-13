// Scoring de conciliação bancária (V2).
// Pontuação máxima: 100 pts.
// Thresholds (em reconciliation.service.ts): ≥75 = RECONCILED, ≥50 = SUGGESTED.

interface MatchInput {
  amount: number;
  date: Date;
  description: string;
  documentNumber?: string | null;
  counterpartyTaxId?: string | null;
  paymentMethod?: string | null;
}

export interface MatchCandidate {
  id: string;
  type: 'expense' | 'income';
  amount: number;
  date: Date;
  description: string;
  documentNumber?: string | null;
  taxId?: string | null;
  paymentMethod?: string | null;
}

export class ReconciliationRulesService {
  score(bankTransaction: MatchInput, candidate: MatchCandidate): number {
    let total = 0;

    // ── Valor (40 pts) ────────────────────────────────────────────────────
    // Exact match = 40, dentro de R$1 = 30, dentro de 2% = 15, >2% = 0
    const amtDiff = Math.abs(Math.abs(bankTransaction.amount) - Math.abs(candidate.amount));
    const amtRatio = candidate.amount > 0 ? amtDiff / Math.abs(candidate.amount) : 1;
    if (amtDiff < 0.01)        total += 40;
    else if (amtDiff < 1.00)   total += 30;
    else if (amtRatio < 0.02)  total += 15;
    else                       return 0; // descarta: diferença de valor > 2%

    // ── Data (25 pts) ─────────────────────────────────────────────────────
    // Usa paidDate se mais próxima que dueDate; janela máxima 45 dias
    const bankMs = new Date(bankTransaction.date).getTime();
    const candidateMs = new Date(candidate.date).getTime();
    const days = Math.abs(bankMs - candidateMs) / 86_400_000;
    if      (days <= 1)  total += 25;
    else if (days <= 3)  total += 20;
    else if (days <= 7)  total += 14;
    else if (days <= 15) total += 7;
    else if (days <= 30) total += 2;
    else if (days <= 45) total += 0;
    else                 return 0; // descarta: mais de 45 dias de diferença

    // ── CPF/CNPJ da contraparte (20 pts) ──────────────────────────────────
    if (sameDocument(bankTransaction.counterpartyTaxId, candidate.taxId)) {
      total += 20;
    }

    // ── Método de pagamento (15 pts) ──────────────────────────────────────
    // Bônus quando banco e lançamento concordam (PIX+PIX, BOLETO+BOLETO, etc.)
    const pmBank = normalizePaymentMethod(bankTransaction.paymentMethod);
    const pmCand = normalizePaymentMethod(candidate.paymentMethod);
    if (pmBank && pmCand && pmBank === pmCand) {
      total += 15;
    }

    // ── Similaridade de descrição (10 pts) ────────────────────────────────
    if (similarDescription(bankTransaction.description, candidate.description)) {
      total += 10;
    }

    // ── Número do documento (5 pts) ───────────────────────────────────────
    if (sameDocument(bankTransaction.documentNumber, candidate.documentNumber)) {
      total += 5;
    }

    return Math.min(100, total);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sameDocument(a?: string | null, b?: string | null): boolean {
  const na = digits(a);
  const nb = digits(b);
  return Boolean(na && nb && na === nb);
}

function similarDescription(a: string, b: string): boolean {
  const wa = new Set(normText(a).split(' ').filter(w => w.length > 2));
  const wb = new Set(normText(b).split(' ').filter(w => w.length > 2));
  if (!wa.size || !wb.size) return false;
  const intersection = [...wa].filter(w => wb.has(w)).length;
  const union = new Set([...wa, ...wb]).size;
  return intersection / union >= 0.30;
}

function normalizePaymentMethod(pm?: string | null): string | null {
  if (!pm) return null;
  const p = pm.toUpperCase().trim();
  // Mapeia variações para grupos canônicos
  if (p.includes('PIX')) return 'PIX';
  if (p.includes('TED') || p.includes('DOC') || p === 'TRANSFERENCIA') return 'TED_DOC';
  if (p.includes('BOLETO') || p.includes('BOL')) return 'BOLETO';
  if (p.includes('CARTAO') || p.includes('CART') || p === 'CREDITO' || p === 'DEBITO') return 'CARTAO';
  if (p.includes('CHEQUE')) return 'CHEQUE';
  return p;
}

function digits(v?: string | null): string {
  return v?.replace(/\D/g, '') || '';
}

function normText(v: string): string {
  return v
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export const reconciliationRulesService = new ReconciliationRulesService();
