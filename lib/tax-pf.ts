// IRPF Tax Calculator — Carnê-Leão and annual IRPF
// Tables based on RFB 2024 values

export interface IRPFBracket {
  min: number;
  max: number | null;
  rate: number;     // alíquota %
  deduction: number; // parcela a deduzir R$
}

// 2024 IRPF table (monthly — carnê-leão)
export const IRPF_TABLE_2024_MONTHLY: IRPFBracket[] = [
  { min: 0, max: 2259.20, rate: 0, deduction: 0 },
  { min: 2259.21, max: 2826.65, rate: 7.5, deduction: 169.44 },
  { min: 2826.66, max: 3751.05, rate: 15, deduction: 381.44 },
  { min: 3751.06, max: 4664.68, rate: 22.5, deduction: 662.77 },
  { min: 4664.69, max: null, rate: 27.5, deduction: 896.00 },
];

// 2024 Annual IRPF table
export const IRPF_TABLE_2024_ANNUAL: IRPFBracket[] = [
  { min: 0, max: 30000.00, rate: 0, deduction: 0 },           // aprox
  { min: 30000.01, max: 33919.80, rate: 7.5, deduction: 2033.99 },
  { min: 33919.81, max: 45012.60, rate: 15, deduction: 4574.99 },
  { min: 45012.61, max: 55976.16, rate: 22.5, deduction: 7952.34 },
  { min: 55976.17, max: null, rate: 27.5, deduction: 10752.34 },
];

export interface IRPFResult {
  grossIncome: number;
  deductions: number;
  taxableBase: number;
  rate: number;
  deductionAmount: number;
  taxDue: number;
  effectiveRate: number;
  exempt: boolean;
  bracket: string;
}

export function calculateIRPFMonthly(
  grossIncome: number,
  deductions: number = 0,
  dependents: number = 0
): IRPFResult {
  const DEPENDENT_DEDUCTION = 189.59; // per dependent per month 2024
  const totalDeductions = deductions + (dependents * DEPENDENT_DEDUCTION);
  const taxableBase = Math.max(0, grossIncome - totalDeductions);

  const bracket = IRPF_TABLE_2024_MONTHLY.find(
    (b) => taxableBase >= b.min && (b.max === null || taxableBase <= b.max)
  ) || IRPF_TABLE_2024_MONTHLY[0];

  const taxDue = Math.max(0, (taxableBase * (bracket.rate / 100)) - bracket.deduction);
  const effectiveRate = grossIncome > 0 ? (taxDue / grossIncome) * 100 : 0;

  return {
    grossIncome,
    deductions: totalDeductions,
    taxableBase,
    rate: bracket.rate,
    deductionAmount: bracket.deduction,
    taxDue,
    effectiveRate,
    exempt: bracket.rate === 0,
    bracket: bracket.max
      ? `R$ ${bracket.min.toLocaleString('pt-BR')} a R$ ${bracket.max.toLocaleString('pt-BR')}`
      : `Acima de R$ ${bracket.min.toLocaleString('pt-BR')}`,
  };
}

export function calculateIRPFAnnual(
  grossIncome: number,
  deductions: number = 0,
  dependents: number = 0,
  withheld: number = 0
): IRPFResult & { withheld: number; balanceDue: number; refund: number } {
  const DEPENDENT_ANNUAL = 2275.08; // per dependent 2024
  const SIMPLIFIED_DEDUCTION = 16754.34; // desconto simplificado 2024
  const totalDependentDeduction = dependents * DEPENDENT_ANNUAL;

  // Use whichever is greater: itemized or simplified
  const itemized = deductions + totalDependentDeduction;
  const simplified = SIMPLIFIED_DEDUCTION;
  const totalDeductions = Math.max(itemized, simplified);

  const taxableBase = Math.max(0, grossIncome - totalDeductions);

  const bracket = IRPF_TABLE_2024_ANNUAL.find(
    (b) => taxableBase >= b.min && (b.max === null || taxableBase <= b.max)
  ) || IRPF_TABLE_2024_ANNUAL[0];

  const taxDue = Math.max(0, (taxableBase * (bracket.rate / 100)) - bracket.deduction);
  const effectiveRate = grossIncome > 0 ? (taxDue / grossIncome) * 100 : 0;
  const balanceDue = Math.max(0, taxDue - withheld);
  const refund = taxDue < withheld ? withheld - taxDue : 0;

  return {
    grossIncome,
    deductions: totalDeductions,
    taxableBase,
    rate: bracket.rate,
    deductionAmount: bracket.deduction,
    taxDue,
    effectiveRate,
    exempt: bracket.rate === 0,
    bracket: bracket.max
      ? `R$ ${bracket.min.toLocaleString('pt-BR')} a R$ ${bracket.max.toLocaleString('pt-BR')}`
      : `Acima de R$ ${bracket.min.toLocaleString('pt-BR')}`,
    withheld,
    balanceDue,
    refund,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Carnê-Leão helpers
// ─────────────────────────────────────────────────────────────────────────────

export type CarneLeaoIncomeType = 'autonomo' | 'alugueis' | 'exterior' | 'pensao_alimenticia' | 'outros';

export function getCarneLeaoDeductionLimit(type: CarneLeaoIncomeType): number {
  switch (type) {
    case 'autonomo': return 0;           // no standard deduction for self-employed
    case 'alugueis': return 0;           // only IPTU, condomínio, taxas podem ser deduzidos
    case 'pensao_alimenticia': return 0; // fully deductible if judicial
    default: return 0;
  }
}

// Monthly carnê-leão due date: last business day of following month (simplified: 30th)
export function getCarneLeaoDueDate(year: number, month: number): Date {
  // Due last business day of following month — we use 28th as safe approximation
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return new Date(nextYear, nextMonth - 1, 28);
}

// Summary of carnê-leão entries for a given period
export interface CarneLeaoSummary {
  totalGross: number;
  totalDeductions: number;
  totalTaxable: number;
  totalTax: number;
  entriesByType: Record<string, { gross: number; tax: number }>;
}

export function summarizeCarneLeao(entries: Array<{
  grossAmount: number;
  deductions: number;
  taxAmount: number;
  incomeType: string;
}>): CarneLeaoSummary {
  const summary: CarneLeaoSummary = {
    totalGross: 0,
    totalDeductions: 0,
    totalTaxable: 0,
    totalTax: 0,
    entriesByType: {},
  };

  for (const e of entries) {
    summary.totalGross += e.grossAmount;
    summary.totalDeductions += e.deductions;
    summary.totalTaxable += e.grossAmount - e.deductions;
    summary.totalTax += e.taxAmount;

    if (!summary.entriesByType[e.incomeType]) {
      summary.entriesByType[e.incomeType] = { gross: 0, tax: 0 };
    }
    summary.entriesByType[e.incomeType].gross += e.grossAmount;
    summary.entriesByType[e.incomeType].tax += e.taxAmount;
  }

  return summary;
}
