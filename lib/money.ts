// Money helper — aritmética monetária segura em CENTAVOS (inteiros).
// Enquanto o schema legado usa Float, TODA comparação/soma de valores em
// código novo deve passar por aqui para eliminar erros de ponto flutuante
// (ex.: 0.1 + 0.2 !== 0.3) em conciliação, faturamento e impostos.

/** Converte um valor em reais (number ou string "1.234,56"/"1234.56") para centavos (int). */
export function toCents(value: number | string): number {
  if (typeof value === 'string') {
    const normalized = value
      .replace(/\s/g, '')
      .replace(/R\$\s?/i, '')
      // "1.234,56" → "1234.56"
      .replace(/\.(?=\d{3}(\D|$))/g, '')
      .replace(',', '.');
    value = Number(normalized);
  }
  if (!Number.isFinite(value)) {
    throw new Error(`Valor monetário inválido: ${value}`);
  }
  // half-up (padrão fiscal brasileiro)
  return Math.sign(value) * Math.round(Math.abs(value) * 100);
}

/** Converte centavos (int) para reais (number, 2 casas). */
export function fromCents(cents: number): number {
  return Math.round(cents) / 100;
}

/** Soma valores em reais com precisão de centavos. */
export function sumMoney(...values: number[]): number {
  return fromCents(values.reduce((acc, v) => acc + toCents(v), 0));
}

/** Compara dois valores monetários em reais com igualdade exata de centavos. */
export function moneyEquals(a: number, b: number): boolean {
  return toCents(a) === toCents(b);
}

/** Diferença absoluta em centavos entre dois valores em reais. */
export function moneyDiffCents(a: number, b: number): number {
  return Math.abs(toCents(a) - toCents(b));
}

/** Aplica um percentual (ex.: 2 = 2%) a um valor em reais, arredondando half-up. */
export function applyPercent(value: number, percent: number): number {
  return fromCents(Math.round(toCents(value) * (percent / 100)));
}

/** Formata em BRL para exibição. */
export function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

/**
 * Juros simples mensais pro-rata dia (padrão boleto: % a.m. / 30 por dia de atraso).
 * @param principal valor em reais
 * @param monthlyPercent juros mensal (ex.: 1 = 1% a.m.)
 * @param daysLate dias de atraso
 */
export function lateInterest(principal: number, monthlyPercent: number, daysLate: number): number {
  if (daysLate <= 0 || monthlyPercent <= 0) return 0;
  const dailyRate = monthlyPercent / 100 / 30;
  return fromCents(Math.round(toCents(principal) * dailyRate * daysLate));
}

/** Multa fixa percentual sobre o principal (ex.: 2%). */
export function lateFine(principal: number, finePercent: number): number {
  if (finePercent <= 0) return 0;
  return applyPercent(principal, finePercent);
}
